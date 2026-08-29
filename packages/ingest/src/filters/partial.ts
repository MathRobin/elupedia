import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, isNull, and, isNotNull } from 'drizzle-orm';
import type { DeputeActivity } from '../sources/an-activite.js';
import type { Declaration } from '../sources/hatvp.js';
import { logger } from '../logger.js';

export interface PartialFilterStats {
  totalBefore: number;
  excludedDeceased: number;
  excludedEndedMandate: number;
  excludedOldResponse: number;
  totalAfter: number;
}

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

export function filterActivitiesForPartial(
  activities: DeputeActivity[],
  activeAnIds: Set<string>,
  deceasedAnIds: Set<string>,
  now: Date = new Date(),
): { filtered: DeputeActivity[]; stats: PartialFilterStats } {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 3);
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

    const kept = depute.activities.filter((a) => {
      if (a.responseDate && a.responseDate < cutoffStr) {
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

export interface HatvpFilterStats {
  totalBefore: number;
  excludedInactive: number;
  totalAfter: number;
}

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

export function logHatvpFilterStats(stats: HatvpFilterStats): void {
  logger.info('HATVP partial filter stats:');
  logger.info(`  Total declarations before: ${stats.totalBefore}`);
  logger.info(`  Excluded (inactive/deceased): ${stats.excludedInactive}`);
  logger.info(`  Total declarations after: ${stats.totalAfter}`);
}

export function logFilterStats(stats: PartialFilterStats): void {
  logger.info('Partial filter stats:');
  logger.info(`  Total activities before: ${stats.totalBefore}`);
  logger.info(`  Excluded (deceased): ${stats.excludedDeceased}`);
  logger.info(`  Excluded (ended mandate): ${stats.excludedEndedMandate}`);
  logger.info(
    `  Excluded (old response >3 months): ${stats.excludedOldResponse}`,
  );
  logger.info(`  Total activities after: ${stats.totalAfter}`);
}
