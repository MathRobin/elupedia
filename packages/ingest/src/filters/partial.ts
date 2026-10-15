/**
 * Filtres de l'ingestion « partielle » : restreindre un export complet aux
 * seuls élus encore actifs, pour des runs fréquents et légers. Deux familles,
 * sur le même modèle (une requête DB pour obtenir les actifs, puis un filtre
 * pur, testable) :
 *   - activité parlementaire AN, par identifiant AN (run-an-partial.ts) ;
 *   - déclarations HATVP, par nom (sans appelant à ce jour).
 *
 * « Actif » = vivant et titulaire d'au moins un mandat sans date de fin,
 * quel que soit le type de mandat.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, isNull, and, isNotNull } from 'drizzle-orm';
import type { DeputeActivity } from '../sources/an-activite.js';
import type { Declaration } from '../sources/hatvp.js';
import { logger } from '../logger.js';

/** Compteurs d'activités (pas de députés) écartées par chaque règle. */
export interface PartialFilterStats {
  totalBefore: number;
  excludedDeceased: number;
  excludedEndedMandate: number;
  excludedOldResponse: number;
  totalAfter: number;
}

// Les questions dont la réponse est plus ancienne que ça n'évoluent plus.
const RESPONSE_MAX_AGE_MONTHS = 3;

/**
 * Identifiants AN des élus actifs et des élus décédés (lecture seule).
 * Les deux ensembles sont disjoints ; un député vivant sans mandat en cours
 * n'est dans aucun des deux.
 */
export async function getActiveDeputyAnIds(
  db: NeonHttpDatabase,
): Promise<{ activeIds: Set<string>; deceasedIds: Set<string> }> {
  const activeRows = await db
    .select({ anId: officials.anId })
    .from(officials)
    .innerJoin(mandates, eq(mandates.officialId, officials.id))
    .where(
      and(
        isNotNull(officials.anId),
        isNull(officials.deathDate),
        isNull(mandates.endDate),
      ),
    );

  const activeIds = new Set<string>();
  for (const row of activeRows) {
    if (row.anId) activeIds.add(row.anId);
  }

  const deceasedRows = await db
    .select({ anId: officials.anId })
    .from(officials)
    .where(and(isNotNull(officials.anId), isNotNull(officials.deathDate)));

  const deceasedIds = new Set<string>();
  for (const row of deceasedRows) {
    if (row.anId) deceasedIds.add(row.anId);
  }

  return { activeIds, deceasedIds };
}

/**
 * Ne garde que les activités des députés actifs, sans les questions dont la
 * réponse date de plus de RESPONSE_MAX_AGE_MONTHS. Fonction pure ; `now`
 * est injectable pour les tests. Un député décédé est compté « décédé »
 * même s'il n'est pas non plus dans `activeAnIds`.
 */
export function filterActivitiesForPartial(
  activities: DeputeActivity[],
  activeAnIds: Set<string>,
  deceasedAnIds: Set<string>,
  now: Date = new Date(),
): { filtered: DeputeActivity[]; stats: PartialFilterStats } {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RESPONSE_MAX_AGE_MONTHS);
  // Comparaison de chaînes ISO (YYYY-MM-DD), comme les dates de la source.
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let totalBefore = 0;
  let excludedDeceased = 0;
  let excludedEndedMandate = 0;
  let excludedOldResponse = 0;

  const filtered: DeputeActivity[] = [];

  for (const depute of activities) {
    totalBefore += depute.activities.length;

    if (deceasedAnIds.has(depute.id_an)) {
      excludedDeceased += depute.activities.length;
      continue;
    }

    if (!activeAnIds.has(depute.id_an)) {
      excludedEndedMandate += depute.activities.length;
      continue;
    }

    // Une question sans réponse est conservée quel que soit son âge.
    const kept = depute.activities.filter((activity) => {
      if (activity.responseDate && activity.responseDate < cutoffStr) {
        excludedOldResponse++;
        return false;
      }
      return true;
    });

    if (kept.length > 0) {
      filtered.push({ id_an: depute.id_an, activities: kept });
    }
  }

  const stats: PartialFilterStats = {
    totalBefore,
    excludedDeceased,
    excludedEndedMandate,
    excludedOldResponse,
    totalAfter:
      totalBefore -
      excludedDeceased -
      excludedEndedMandate -
      excludedOldResponse,
  };

  return { filtered, stats };
}

/** Compteurs de déclarations écartées (filtre HATVP). */
export interface HatvpFilterStats {
  totalBefore: number;
  excludedInactive: number;
  totalAfter: number;
}

/**
 * Clés « NOM|PRÉNOM » (majuscules, non désaccentuées) des élus actifs,
 * tous mandats confondus (lecture seule).
 */
export async function getActiveOfficialNames(
  db: NeonHttpDatabase,
): Promise<Set<string>> {
  const rows = await db
    .select({
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials)
    .innerJoin(mandates, eq(mandates.officialId, officials.id))
    .where(and(isNull(officials.deathDate), isNull(mandates.endDate)));

  const names = new Set<string>();
  for (const row of rows) {
    names.add(`${row.lastName.toUpperCase()}|${row.firstName.toUpperCase()}`);
  }
  return names;
}

/** Ne garde que les déclarations dont « NOM|PRÉNOM » est dans `activeNames`. Fonction pure. */
export function filterDeclarationsForPartial(
  declarations: Declaration[],
  activeNames: Set<string>,
): { filtered: Declaration[]; stats: HatvpFilterStats } {
  const totalBefore = declarations.length;
  let excludedInactive = 0;

  const filtered = declarations.filter((decl) => {
    const key = `${decl.nom.toUpperCase()}|${decl.prenom.toUpperCase()}`;
    if (!activeNames.has(key)) {
      excludedInactive++;
      return false;
    }
    return true;
  });

  return {
    filtered,
    stats: {
      totalBefore,
      excludedInactive,
      totalAfter: totalBefore - excludedInactive,
    },
  };
}

/** Affiche les compteurs du filtre HATVP. */
export function logHatvpFilterStats(stats: HatvpFilterStats): void {
  logger.info('HATVP partial filter stats:');
  logger.info(`  Total declarations before: ${stats.totalBefore}`);
  logger.info(`  Excluded (inactive/deceased): ${stats.excludedInactive}`);
  logger.info(`  Total declarations after: ${stats.totalAfter}`);
}

/** Affiche les compteurs du filtre d'activité AN. */
export function logActivityFilterStats(stats: PartialFilterStats): void {
  logger.info('Partial filter stats:');
  logger.info(`  Total activities before: ${stats.totalBefore}`);
  logger.info(`  Excluded (deceased): ${stats.excludedDeceased}`);
  logger.info(`  Excluded (ended mandate): ${stats.excludedEndedMandate}`);
  logger.info(
    `  Excluded (old response >3 months): ${stats.excludedOldResponse}`,
  );
  logger.info(`  Total activities after: ${stats.totalAfter}`);
}
