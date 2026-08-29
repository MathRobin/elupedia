import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchActivities } from './sources/an-activite.js';
import { fetchDeclarations } from './sources/hatvp.js';
import { upsertParliamentaryActivity } from './upsert/parliamentary-activity.js';
import { upsertInterests } from './upsert/interests.js';
import { upsertDeclarationSnapshots } from './upsert/declaration-snapshots.js';
import {
  getActiveDeputyAnIds,
  getActiveOfficialNames,
  filterActivitiesForPartial,
  filterDeclarationsForPartial,
  logFilterStats,
  logHatvpFilterStats,
} from './filters/partial.js';

export async function runAnPartial(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion AN partielle started ===\n');

  logger.info('[1/3] Fetching active deputies from DB...');
  const t0 = Date.now();
  const [{ activeIds, deceasedIds }, activeNames] = await Promise.all([
    getActiveDeputyAnIds(db),
    getActiveOfficialNames(db),
  ]);
  logger.info(
    `  Active deputies: ${activeIds.size}, deceased: ${deceasedIds.size}, active names: ${activeNames.size} (${Date.now() - t0}ms)`,
  );

  logger.info('[2/3] Parliamentary activity (filtered)...');
  results.push(
    await runStep('parliamentary-activity', async () => {
      const activities = await withRetry(() => fetchActivities(), {
        source: 'an-activite',
      });

      const { filtered, stats } = filterActivitiesForPartial(
        activities,
        activeIds,
        deceasedIds,
      );
      logFilterStats(stats);

      const r = await upsertParliamentaryActivity(db, filtered);
      return {
        source: 'parliamentary-activity',
        created: r.created,
        updated: r.updated,
        durationMs: 0,
      };
    }),
  );

  logger.info('[3/3] Interests HATVP (filtered)...');
  results.push(
    await runStep('interests', async () => {
      const declarations = await withRetry(() => fetchDeclarations(), {
        source: 'hatvp',
      });

      const { filtered, stats } = filterDeclarationsForPartial(
        declarations,
        activeNames,
      );
      logHatvpFilterStats(stats);

      const r = await upsertInterests(db, filtered);
      const snap = await upsertDeclarationSnapshots(db, filtered);
      return {
        source: 'interests',
        created: r.created + snap.created,
        updated: r.updated + snap.updated,
        durationMs: 0,
      };
    }),
  );

  printSummary('Ingestion AN partielle', results, logger);
  return results;
}
