/**
 * Upsert des maires à partir du Répertoire national des élus
 * (`sources/rne-maires.ts`). Appelé par `run-maires.ts` (étape 1, avant
 * adresses de mairie, photos et scrape des sites).
 *
 * Tables écrites : `officials` (création uniquement, jamais de mise à jour
 * d'une fiche existante) et `mandates` (type 'maire', `commune_code` = code
 * INSEE, `district` = nom de commune, `department` = nom de département).
 * Clé de rapprochement official : (prénom, nom, date de naissance), en
 * minuscules — le RNE ne fournit aucun identifiant stable. Mandat : un seul
 * mandat 'maire' actif par commune ; pour un maire donné,
 * (official_id, type, commune_code) actif (end_date NULL).
 * Idempotent : date inchangée ou antérieure -> réécriture en place ; date de
 * prise de fonction plus récente -> clôture + nouveau mandat (réélection
 * historisée) ; commune absente du RNE -> mandat actif clôturé à la date du
 * run ; autre titulaire dans le RNE -> mandat du prédécesseur clôturé à la
 * date de prise de fonction du successeur. Une violation de l'index unique
 * (official_id, type, start_date) est absorbée et comptée en `skipped`.
 * Reprise : un checkpoint fichier (`utils/checkpoint.ts`) mémorise la
 * dernière clé de tri traitée ; un run interrompu reprend après elle (les
 * maires sont triés par commune/nom pour rendre ce curseur stable).
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { RneMaire } from '../sources/rne-maires.js';
import { logger } from '../logger.js';
import {
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} from '../utils/checkpoint.js';

const MANDATE_TYPE = 'maire' as const;
const BATCH_SIZE = 200;
const CHECKPOINT_NAME = 'upsert-mayors';
// Pause entre deux lots pour limiter le débit de requêtes vers Neon
// (~35 000 maires, plusieurs requêtes par maire).
const BATCH_PAUSE_MS = 1200;

// Code SQLSTATE Postgres "unique_violation", éventuellement enveloppé dans
// `cause` par le driver Neon HTTP.
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && (error as { code?: unknown }).code === '23505') {
    return true;
  }
  if ('cause' in error) {
    return isUniqueViolation((error as { cause?: unknown }).cause);
  }
  return false;
}

function slugify(firstName: string, lastName: string): string {
  return `${firstName}-${lastName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Clé d'identité d'une personne, faute d'identifiant RNE stable.
function officialKey(
  firstName: string,
  lastName: string,
  birthDate: string | null,
): string {
  return `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${birthDate ?? ''}`;
}

// Suffixe numérique en cas de collision de slug (homonymes). `usedSlugs` est
// mis à jour pour que deux créations du même run ne se percutent pas.
function uniqueSlug(usedSlugs: Set<string>, base: string): string {
  if (!usedSlugs.has(base)) {
    usedSlugs.add(base);
    return base;
  }
  let suffix = 1;
  while (usedSlugs.has(`${base}-${suffix}`)) suffix++;
  const candidate = `${base}-${suffix}`;
  usedSlugs.add(candidate);
  return candidate;
}

// Ordre de traitement stable, également utilisé comme valeur de checkpoint.
function sortKey(maire: RneMaire): string {
  return `${maire.communeCode}|${maire.lastName}|${maire.firstName}`;
}

/**
 * Crée les officials manquants puis synchronise les mandats de maire avec le
 * RNE (écriture DB, checkpoint fichier). Retourne les compteurs officials
 * créés / mandates upsertés / ended / reelected / skipped.
 */
export async function upsertMayors(db: NeonHttpDatabase, maires: RneMaire[]) {
  const summary = {
    officials: 0,
    mandates: 0,
    ended: 0,
    reelected: 0,
    skipped: 0,
  };

  const sorted = [...maires].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );

  const checkpoint = loadCheckpoint(CHECKPOINT_NAME);
  let startIndex = 0;
  if (checkpoint) {
    startIndex = sorted.findIndex((maire) => sortKey(maire) > checkpoint);
    if (startIndex === -1) startIndex = sorted.length;
    logger.info(
      `  Checkpoint found — resuming after "${checkpoint}" (skipping ${startIndex}/${sorted.length})`,
    );
  }

  const allOfficials = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      birthDate: officials.birthDate,
      slug: officials.slug,
    })
    .from(officials);

  const officialByKey = new Map<string, { id: string; slug: string | null }>();
  for (const official of allOfficials) {
    officialByKey.set(
      officialKey(official.firstName, official.lastName, official.birthDate),
      { id: official.id, slug: official.slug },
    );
  }

  const usedSlugs = new Set(
    allOfficials
      .filter((official) => official.slug)
      .map((official) => official.slug!),
  );

  // Un seul maire actif par commune : cette Map sert à détecter les
  // changements de titulaire et est tenue à jour au fil des insertions.
  const activeMandatesByCommune = new Map<
    string,
    { id: string; officialId: string }
  >();
  const activeMandates = await db
    .select({
      id: mandates.id,
      officialId: mandates.officialId,
      communeCode: mandates.communeCode,
    })
    .from(mandates)
    .where(and(eq(mandates.type, MANDATE_TYPE), isNull(mandates.endDate)));

  for (const mandate of activeMandates) {
    if (mandate.communeCode) {
      activeMandatesByCommune.set(mandate.communeCode, {
        id: mandate.id,
        officialId: mandate.officialId,
      });
    }
  }

  const rneCommuneCodes = new Set(sorted.map((maire) => maire.communeCode));
  const today = new Date().toISOString().split('T')[0];

  // Clôture des mandats des communes disparues du RNE (maire parti, commune
  // fusionnée, etc.). Exécuté à chaque run, y compris en reprise sur
  // checkpoint.
  for (const [communeCode, mandate] of activeMandatesByCommune) {
    if (!rneCommuneCodes.has(communeCode)) {
      await db
        .update(mandates)
        .set({ endDate: today, updatedAt: new Date() })
        .where(eq(mandates.id, mandate.id));
      summary.ended++;
    }
  }

  const totalBatches = Math.ceil((sorted.length - startIndex) / BATCH_SIZE);

  for (let start = startIndex; start < sorted.length; start += BATCH_SIZE) {
    const batch = sorted.slice(start, start + BATCH_SIZE);
    const batchNum = Math.floor((start - startIndex) / BATCH_SIZE) + 1;
    logger.info(
      `  Processing batch ${batchNum}/${totalBatches} (${batch.length} maires)`,
    );

    for (const maire of batch) {
      const key = officialKey(maire.firstName, maire.lastName, maire.birthDate);
      let official = officialByKey.get(key);

      if (!official) {
        const slug = uniqueSlug(
          usedSlugs,
          slugify(maire.firstName, maire.lastName),
        );
        const [inserted] = await db
          .insert(officials)
          .values({
            firstName: maire.firstName,
            lastName: maire.lastName,
            birthDate: maire.birthDate,
            slug,
          })
          .returning({ id: officials.id });
        official = { id: inserted!.id, slug };
        officialByKey.set(key, official);
        summary.officials++;
      }

      // Changement de titulaire : le mandat du prédécesseur est clos à la
      // date de prise de fonction du successeur (à défaut, aujourd'hui).
      const previous = activeMandatesByCommune.get(maire.communeCode);

      if (previous && previous.officialId !== official.id) {
        await db
          .update(mandates)
          .set({
            endDate: maire.functionStartDate || maire.mandateStartDate || today,
            updatedAt: new Date(),
          })
          .where(eq(mandates.id, previous.id));
        summary.ended++;
        activeMandatesByCommune.delete(maire.communeCode);
      }

      const activeMandateRows = await db
        .select({ id: mandates.id, startDate: mandates.startDate })
        .from(mandates)
        .where(
          and(
            eq(mandates.officialId, official.id),
            eq(mandates.type, MANDATE_TYPE),
            eq(mandates.communeCode, maire.communeCode),
            isNull(mandates.endDate),
          ),
        )
        .limit(1);
      const activeMandate = activeMandateRows[0];

      // functionStartDate (prise de fonction de CET élu) plutôt que
      // mandateStartDate (élection du conseil municipal, inchangée lors
      // d'un remplacement en cours de mandat — ex. démission) : sinon un
      // remplacement se voit attribuer la date de début du prédécesseur.
      const newStartDate = maire.functionStartDate || maire.mandateStartDate;

      const label = `${maire.firstName} ${maire.lastName} (${maire.communeName}, ${maire.communeCode})`;

      if (!newStartDate) {
        logger.warn(
          `  Skipping mandate for ${label}: ` +
            `no mandate/function start date in source data`,
        );
        summary.skipped++;
        continue;
      }

      const mandateValues = {
        officialId: official.id,
        type: MANDATE_TYPE,
        district: maire.communeName,
        department: maire.departmentName,
        startDate: newStartDate,
        communeCode: maire.communeCode,
      };

      // Une date de prise de fonction postérieure à celle du mandat actif
      // signale une réélection ou un remplacement : on clôt l'ancien mandat
      // et on en ouvre un nouveau. Une date antérieure est une simple
      // correction de la période en cours (RNE précise une date
      // provisoire) : on met à jour la ligne existante sans l'historiser.
      const isReelection =
        !!activeMandate && newStartDate > activeMandate.startDate;

      if (!activeMandate) {
        try {
          const [inserted] = await db
            .insert(mandates)
            .values(mandateValues)
            .returning({ id: mandates.id });
          activeMandatesByCommune.set(maire.communeCode, {
            id: inserted!.id,
            officialId: official.id,
          });
          summary.mandates++;
        } catch (error) {
          if (isUniqueViolation(error)) {
            logger.warn(
              `  Skipping mandate for ${label}: ` +
                `official already has a "${MANDATE_TYPE}" mandate starting on the same date elsewhere — likely a homonym or bad source data`,
            );
            summary.skipped++;
          } else {
            throw error;
          }
        }
      } else if (isReelection) {
        try {
          // Clôture de l'ancien mandat et ouverture du nouveau dans le même
          // batch (transaction unique côté Neon) : si l'insertion échoue
          // (contrainte unique violée), la clôture est annulée avec elle —
          // jamais de mandat clos sans remplaçant.
          const [, [inserted]] = await db.batch([
            db
              .update(mandates)
              .set({ endDate: newStartDate, updatedAt: new Date() })
              .where(eq(mandates.id, activeMandate.id)),
            db
              .insert(mandates)
              .values(mandateValues)
              .returning({ id: mandates.id }),
          ]);
          activeMandatesByCommune.set(maire.communeCode, {
            id: inserted!.id,
            officialId: official.id,
          });
          summary.reelected++;
          summary.mandates++;
        } catch (error) {
          if (isUniqueViolation(error)) {
            logger.warn(
              `  Skipping mandate for ${label}: ` +
                `official already has a "${MANDATE_TYPE}" mandate starting on the same date elsewhere — likely a homonym or bad source data`,
            );
            summary.skipped++;
          } else {
            throw error;
          }
        }
      } else {
        try {
          await db
            .update(mandates)
            .set({
              district: maire.communeName,
              department: maire.departmentName,
              startDate: newStartDate,
              endDate: null,
              updatedAt: new Date(),
            })
            .where(eq(mandates.id, activeMandate.id));
          summary.mandates++;
        } catch (error) {
          if (isUniqueViolation(error)) {
            logger.warn(
              `  Skipping mandate update for ${label}: ` +
                `official already has a "${MANDATE_TYPE}" mandate starting on the same date elsewhere — likely a homonym or bad source data`,
            );
            summary.skipped++;
          } else {
            throw error;
          }
        }
      }
    }

    saveCheckpoint(CHECKPOINT_NAME, sortKey(batch[batch.length - 1]));
    await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
  }

  clearCheckpoint(CHECKPOINT_NAME);

  logger.info(
    `Mayors: ${summary.officials} officials created, ${summary.mandates} mandates upserted, ${summary.ended} mandates ended, ${summary.reelected} re-elections historized`,
  );
  return summary;
}
