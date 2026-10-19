/**
 * Upsert des conseillers communautaires à partir du Répertoire national des
 * élus (`sources/rne-conseillers-epci.ts`). Appelé par
 * `run-conseillers-epci.ts`.
 *
 * Tables écrites : `officials` (création uniquement, jamais de mise à jour
 * d'une fiche existante) et `mandates` (type 'conseiller_communautaire',
 * `district` = libellé de l'EPCI, `department` = département,
 * `commune_code` = commune de rattachement).
 *
 * Rapprochement des personnes — un conseiller communautaire est presque
 * toujours déjà conseiller municipal, voire maire, de sa commune : c'est un
 * mandat qui s'AJOUTE à une personne déjà en base, pas une nouvelle personne.
 * Clé : (prénom, nom, date de naissance), en minuscules, la même que pour les
 * maires (le RNE ne fournit aucun identifiant stable). Un maire déjà ingéré
 * reçoit donc un second mandat sur la MÊME fiche ; les autres sont créés. Un
 * homonyme de même date de naissance serait fusionné par erreur : improbable
 * à cette granularité, et sans conséquence sur les mandats (un mandat par
 * EPCI et date de début).
 *
 * Mandat — identifié par (official_id, type, district) actif (end_date NULL).
 * Date de début = date de début du MANDAT (le siège), pas celle de la fonction
 * : la fonction (président, vice-président) est élue après le siège pour
 * 9 644 lignes sur 62 129, et sa date ne dit rien du début du siège.
 * Idempotent : un mandat inchangé n'est pas réécrit ; une date de début plus
 * récente clôture l'ancien mandat et en ouvre un nouveau (historisation) ; les
 * mandats actifs dont le titulaire a disparu de son EPCI sont clôturés à la
 * date du run. Une violation de l'index unique (official_id, type, start_date)
 * est absorbée et comptée en `skipped` (même personne dans deux EPCI le même
 * jour, ou donnée source douteuse) plutôt que d'interrompre le run.
 *
 * Volume (62 129 lignes, 1 250 EPCI) : traitement par lots triés, écritures
 * groupées (un INSERT multi-lignes pour les officials, un pour les mandats)
 * et point de reprise après chaque lot (utils/checkpoint.ts), comme
 * upsert/mayors.ts.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates, normalizePersonName } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { RneConseillerEpci } from '../sources/rne-conseillers-epci.js';
import { logger } from '../logger.js';
import {
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} from '../utils/checkpoint.js';

export const MANDATE_TYPE = 'conseiller_communautaire' as const;
export const BATCH_SIZE = 500;
const CHECKPOINT_NAME = 'upsert-conseillers-epci';
const BATCH_PAUSE_MS = 300;

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
export function officialKey(
  firstName: string,
  lastName: string,
  birthDate: string | null,
): string {
  return `${normalizePersonName(firstName)}|${normalizePersonName(lastName)}|${birthDate ?? ''}`;
}

// Ordre stable des lignes, nécessaire au point de reprise.
export function sortKey(c: RneConseillerEpci): string {
  return `${c.epciSiren}|${c.communeCode}|${c.lastName}|${c.firstName}|${c.birthDate}`;
}

// Date de début du siège ; repli sur la date de fonction si la source n'en
// donne pas (jamais observé : 0 ligne sans date de mandat au 15/10/2026).
export function startDateOf(c: RneConseillerEpci): string {
  return c.mandateStartDate || c.functionStartDate;
}

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

interface ActiveMandate {
  id: string;
  district: string | null;
  department: string | null;
  communeCode: string | null;
  startDate: string;
}

/**
 * Crée les officials manquants puis synchronise leurs mandats de conseiller
 * communautaire avec le RNE (écriture DB). Retourne les compteurs officials
 * créés / mandates créés / updated / reelected (historisés) / ended / skipped.
 */
export async function upsertConseillersEpci(
  db: NeonHttpDatabase,
  conseillers: RneConseillerEpci[],
) {
  const summary = {
    officials: 0,
    mandates: 0,
    updated: 0,
    reelected: 0,
    ended: 0,
    skipped: 0,
  };

  const sorted = [...conseillers].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );

  const checkpoint = loadCheckpoint(CHECKPOINT_NAME);
  let startIndex = 0;
  if (checkpoint) {
    startIndex = sorted.findIndex((c) => sortKey(c) > checkpoint);
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

  const officialByKey = new Map<string, string>();
  for (const o of allOfficials) {
    officialByKey.set(officialKey(o.firstName, o.lastName, o.birthDate), o.id);
  }
  const usedSlugs = new Set(
    allOfficials.filter((o) => o.slug).map((o) => o.slug!),
  );

  const activeRows = await db
    .select({
      id: mandates.id,
      officialId: mandates.officialId,
      district: mandates.district,
      department: mandates.department,
      communeCode: mandates.communeCode,
      startDate: mandates.startDate,
    })
    .from(mandates)
    .where(and(eq(mandates.type, MANDATE_TYPE), isNull(mandates.endDate)));

  const activeByOfficial = new Map<string, ActiveMandate[]>();
  const addActive = (officialId: string, m: ActiveMandate) => {
    const list = activeByOfficial.get(officialId) ?? [];
    list.push(m);
    activeByOfficial.set(officialId, list);
  };
  for (const row of activeRows) {
    addActive(row.officialId, row);
  }

  // Mandats dont le titulaire a disparu de son EPCI : clôturés à la date du
  // run. Seuls les officials DÉJÀ en base peuvent avoir un mandat actif, donc
  // la présence se vérifie sans créer personne.
  const present = new Set<string>();
  for (const c of sorted) {
    const id = officialByKey.get(
      officialKey(c.firstName, c.lastName, c.birthDate),
    );
    if (id) present.add(`${id}|${c.epciName}`);
  }
  const today = new Date().toISOString().split('T')[0];
  for (const row of activeRows) {
    if (!present.has(`${row.officialId}|${row.district}`)) {
      await db
        .update(mandates)
        .set({ endDate: today, updatedAt: new Date() })
        .where(eq(mandates.id, row.id));
      const list = activeByOfficial.get(row.officialId) ?? [];
      activeByOfficial.set(
        row.officialId,
        list.filter((m) => m.id !== row.id),
      );
      summary.ended++;
    }
  }

  const totalBatches = Math.ceil((sorted.length - startIndex) / BATCH_SIZE);

  for (let start = startIndex; start < sorted.length; start += BATCH_SIZE) {
    const batch = sorted.slice(start, start + BATCH_SIZE);
    const batchNum = Math.floor((start - startIndex) / BATCH_SIZE) + 1;
    logger.info(
      `  Processing batch ${batchNum}/${totalBatches} (${batch.length} conseillers)`,
    );

    // 1. Officials manquants, créés en un seul INSERT multi-lignes.
    const toCreate = new Map<string, RneConseillerEpci>();
    for (const c of batch) {
      const key = officialKey(c.firstName, c.lastName, c.birthDate);
      if (!officialByKey.has(key) && !toCreate.has(key)) toCreate.set(key, c);
    }
    if (toCreate.size > 0) {
      const created = await db
        .insert(officials)
        .values(
          [...toCreate.values()].map((c) => ({
            firstName: c.firstName,
            lastName: c.lastName,
            birthDate: c.birthDate,
            slug: uniqueSlug(usedSlugs, slugify(c.firstName, c.lastName)),
          })),
        )
        .returning({
          id: officials.id,
          firstName: officials.firstName,
          lastName: officials.lastName,
          birthDate: officials.birthDate,
        });
      for (const o of created) {
        officialByKey.set(
          officialKey(o.firstName, o.lastName, o.birthDate),
          o.id,
        );
      }
      summary.officials += created.length;
    }

    // 2. Mandats : insertion groupée, mises à jour et historisations à l'unité
    // (cas rares une fois la première ingestion faite).
    const inserts: (typeof mandates.$inferInsert)[] = [];
    const insertedKeys = new Set<string>();
    for (const c of batch) {
      const officialId = officialByKey.get(
        officialKey(c.firstName, c.lastName, c.birthDate),
      );
      const label = `${c.firstName} ${c.lastName} (${c.epciName}, ${c.communeName})`;
      const startDate = startDateOf(c);
      if (!officialId) {
        // Ne devrait pas arriver : l'official vient d'être créé à l'étape 1.
        logger.warn(`  Skipping ${label}: official introuvable après création`);
        summary.skipped++;
        continue;
      }
      if (!startDate) {
        logger.warn(
          `  Skipping mandate for ${label}: no mandate/function start date in source data`,
        );
        summary.skipped++;
        continue;
      }

      const values = {
        officialId,
        type: MANDATE_TYPE,
        district: c.epciName,
        department: c.departmentName,
        communeCode: c.communeCode || null,
        startDate,
      };
      const active = (activeByOfficial.get(officialId) ?? []).find(
        (m) => m.district === c.epciName,
      );

      if (!active) {
        const key = `${officialId}|${startDate}`;
        if (insertedKeys.has(key)) {
          logger.warn(
            `  Skipping mandate for ${label}: same person already listed with the same start date in this batch`,
          );
          summary.skipped++;
          continue;
        }
        insertedKeys.add(key);
        inserts.push(values);
      } else if (startDate > active.startDate) {
        try {
          // Clôture et ouverture dans le même batch (transaction unique côté
          // Neon) : si l'insertion échoue, la clôture est annulée avec elle.
          const [, [inserted]] = await db.batch([
            db
              .update(mandates)
              .set({ endDate: startDate, updatedAt: new Date() })
              .where(eq(mandates.id, active.id)),
            db.insert(mandates).values(values).returning({ id: mandates.id }),
          ]);
          const list = activeByOfficial.get(officialId) ?? [];
          activeByOfficial.set(
            officialId,
            list.filter((m) => m.id !== active.id),
          );
          addActive(officialId, {
            id: inserted!.id,
            district: values.district,
            department: values.department,
            communeCode: values.communeCode,
            startDate,
          });
          summary.reelected++;
          summary.mandates++;
        } catch (error) {
          if (isUniqueViolation(error)) {
            logger.warn(
              `  Skipping mandate for ${label}: official already has a "${MANDATE_TYPE}" mandate starting on the same date elsewhere`,
            );
            summary.skipped++;
          } else {
            throw error;
          }
        }
      } else if (
        startDate !== active.startDate ||
        values.department !== active.department ||
        values.communeCode !== active.communeCode
      ) {
        // Correction de la période en cours (le RNE précise une date
        // provisoire, ou la commune de rattachement change) : on met à jour
        // la ligne sans l'historiser.
        try {
          await db
            .update(mandates)
            .set({
              department: values.department,
              communeCode: values.communeCode,
              startDate,
              updatedAt: new Date(),
            })
            .where(eq(mandates.id, active.id));
          active.department = values.department;
          active.communeCode = values.communeCode;
          active.startDate = startDate;
          summary.updated++;
        } catch (error) {
          if (isUniqueViolation(error)) {
            logger.warn(
              `  Skipping mandate update for ${label}: official already has a "${MANDATE_TYPE}" mandate starting on the same date elsewhere`,
            );
            summary.skipped++;
          } else {
            throw error;
          }
        }
      }
    }

    if (inserts.length > 0) {
      const created = await db
        .insert(mandates)
        .values(inserts)
        .onConflictDoNothing()
        .returning({
          id: mandates.id,
          officialId: mandates.officialId,
          district: mandates.district,
          department: mandates.department,
          communeCode: mandates.communeCode,
          startDate: mandates.startDate,
        });
      for (const m of created) addActive(m.officialId, m);
      summary.mandates += created.length;
      const conflicts = inserts.length - created.length;
      if (conflicts > 0) {
        logger.warn(
          `  ${conflicts} mandat(s) ignoré(s) : même personne, même date de début, déjà un mandat "${MANDATE_TYPE}" (homonyme ou même personne dans deux EPCI)`,
        );
        summary.skipped += conflicts;
      }
    }

    saveCheckpoint(CHECKPOINT_NAME, sortKey(batch[batch.length - 1]));
    await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
  }

  clearCheckpoint(CHECKPOINT_NAME);

  logger.info(
    `Conseillers communautaires: ${summary.officials} officials created, ${summary.mandates} mandates created, ${summary.updated} updated, ${summary.reelected} historized, ${summary.ended} ended, ${summary.skipped} skipped`,
  );
  return summary;
}

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
