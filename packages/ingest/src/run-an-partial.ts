import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchActivities } from './sources/an-activite.js';
import { upsertParliamentaryActivity } from './upsert/parliamentary-activity.js';
import {
  getActiveDeputyAnIds,
  filterActivitiesForPartial,
  logFilterStats,
} from './filters/partial.js';

export async function runAnPartial(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion AN partielle started ===\n');

  logger.info('[1/2] Fetching active deputies from DB...');
  const t0 = Date.now();
  const { activeIds, deceasedIds } = await getActiveDeputyAnIds(db);
  logger.info(
    `  Active deputies: ${activeIds.size}, deceased: ${deceasedIds.size} (${Date.now() - t0}ms)`,
  );

  logger.info('[2/2] Parliamentary activity (filtered)...');
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

  printSummary('Ingestion AN partielle', results, logger);
  return results;
}
