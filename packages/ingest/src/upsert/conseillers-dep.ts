/**
 * Upsert des conseillers départementaux à partir du Répertoire national des
 * élus (`sources/rne-conseillers-dep.ts`). Appelé par
 * `run-conseillers-dep.ts`.
 *
 * Tables écrites : `officials` (création uniquement, jamais de mise à jour
 * d'une fiche existante) et `mandates` (type 'conseiller_departemental',
 * `district` = canton, `department` = département).
 * Clé de rapprochement official : (prénom, nom, date de naissance), en
 * minuscules — le RNE ne fournit aucun identifiant stable. Mandat :
 * (official_id, type, district) actif (end_date NULL).
 * Idempotent : un mandat dont la date de début est inchangée est simplement
 * réécrit en place ; une date de prise de fonction plus récente clôture
 * l'ancien mandat et en ouvre un nouveau (historisation) ; les mandats
 * actifs dont le titulaire a disparu du RNE pour son canton sont clôturés à
 * la date du run. Une violation de l'index unique
 * (official_id, type, start_date) est absorbée et comptée en `skipped`
 * (homonyme ou donnée source douteuse) plutôt que d'interrompre le run.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { RneConseillerDep } from '../sources/rne-conseillers-dep.js';
import { logger } from '../logger.js';

const MANDATE_TYPE = 'conseiller_departemental' as const;

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

function cantonKey(departmentName: string, cantonName: string): string {
  return `${departmentName}|${cantonName}`;
}

/**
 * Crée les officials manquants puis synchronise leurs mandats de conseiller
 * départemental avec le RNE (écriture DB). Retourne les compteurs officials
 * créés / mandates upsertés / ended / replaced / skipped.
 */
export async function upsertConseillersDep(
  db: NeonHttpDatabase,
  conseillers: RneConseillerDep[],
) {
  const summary = {
    officials: 0,
    mandates: 0,
    ended: 0,
    replaced: 0,
    skipped: 0,
  };

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

  // Chaque canton élit un binôme (2 sièges) : contrairement aux maires (poste à
  // titulaire unique), on ne peut pas fermer "l'ancien titulaire" d'un canton en
  // se basant sur un seul mandat actif. On résout donc d'abord tous les officials,
  // puis on ferme les mandats dont le titulaire n'apparaît plus dans le fichier
  // RNE pour son canton.
  const resolved: Array<{ row: RneConseillerDep; officialId: string }> = [];
  for (const conseiller of conseillers) {
    const key = officialKey(
      conseiller.firstName,
      conseiller.lastName,
      conseiller.birthDate,
    );
    let official = officialByKey.get(key);

    if (!official) {
      const slug = uniqueSlug(
        usedSlugs,
        slugify(conseiller.firstName, conseiller.lastName),
      );
      const [inserted] = await db
        .insert(officials)
        .values({
          firstName: conseiller.firstName,
          lastName: conseiller.lastName,
          birthDate: conseiller.birthDate,
          slug,
        })
        .returning({ id: officials.id });
      official = { id: inserted!.id, slug };
      officialByKey.set(key, official);
      summary.officials++;
    }

    resolved.push({ row: conseiller, officialId: official.id });
  }

  const currentPairs = new Set(
    resolved.map(
      ({ row, officialId }) =>
        `${cantonKey(row.departmentName, row.cantonName)}|${officialId}`,
    ),
  );

  const activeMandates = await db
    .select({
      id: mandates.id,
      officialId: mandates.officialId,
      district: mandates.district,
      department: mandates.department,
    })
    .from(mandates)
    .where(and(eq(mandates.type, MANDATE_TYPE), isNull(mandates.endDate)));

  const today = new Date().toISOString().split('T')[0];

  for (const mandate of activeMandates) {
    const pair = `${cantonKey(mandate.department ?? '', mandate.district ?? '')}|${mandate.officialId}`;
    if (!currentPairs.has(pair)) {
      await db
        .update(mandates)
        .set({ endDate: today, updatedAt: new Date() })
        .where(eq(mandates.id, mandate.id));
      summary.ended++;
    }
  }

  for (const { row: conseiller, officialId } of resolved) {
    const activeMandateRows = await db
      .select({ id: mandates.id, startDate: mandates.startDate })
      .from(mandates)
      .where(
        and(
          eq(mandates.officialId, officialId),
          eq(mandates.type, MANDATE_TYPE),
          eq(mandates.district, conseiller.cantonName),
          isNull(mandates.endDate),
        ),
      )
      .limit(1);
    const activeMandate = activeMandateRows[0];

    // functionStartDate (prise de fonction de CET élu) plutôt que
    // mandateStartDate (élection du conseil, inchangée lors d'un
    // remplacement en cours de mandat) : sinon un remplacement se voit
    // attribuer la date de début du prédécesseur.
    const newStartDate =
      conseiller.functionStartDate || conseiller.mandateStartDate;

    const label = `${conseiller.firstName} ${conseiller.lastName} (${conseiller.cantonName}, ${conseiller.departmentName})`;

    if (!newStartDate) {
      logger.warn(
        `  Skipping mandate for ${label}: ` +
          `no mandate/function start date in source data`,
      );
      summary.skipped++;
      continue;
    }

    const mandateValues = {
      officialId,
      type: MANDATE_TYPE,
      district: conseiller.cantonName,
      department: conseiller.departmentName,
      startDate: newStartDate,
    };

    // Une date de prise de fonction postérieure à celle du mandat actif
    // signale un remplacement : on clôt l'ancien mandat et on en ouvre un
    // nouveau plutôt que d'écraser la ligne existante, pour ne pas perdre
    // l'historique. Une date antérieure est une simple correction de la
    // période en cours : on met à jour la ligne existante sans l'historiser.
    const isReplacement =
      !!activeMandate && newStartDate > activeMandate.startDate;

    if (!activeMandate) {
      try {
        await db.insert(mandates).values(mandateValues);
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
    } else if (isReplacement) {
      try {
        // Clôture et ouverture dans le même batch (transaction unique côté
        // Neon) : si l'insertion échoue, la clôture est annulée avec elle.
        await db.batch([
          db
            .update(mandates)
            .set({ endDate: newStartDate, updatedAt: new Date() })
            .where(eq(mandates.id, activeMandate.id)),
          db.insert(mandates).values(mandateValues),
        ]);
        summary.mandates++;
        summary.replaced++;
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
            department: conseiller.departmentName,
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

  logger.info(
    `Conseillers départementaux: ${summary.officials} officials created, ${summary.mandates} mandates upserted, ${summary.ended} mandates ended, ${summary.replaced} replacements historized`,
  );
  return summary;
}
