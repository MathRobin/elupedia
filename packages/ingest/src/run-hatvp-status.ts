import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { upsertHatvpStatuses } from './upsert/hatvp-status.js';

export async function runHatvpStatus(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== HATVP declaration status check started ===\n');

  results.push(
    await runStep('hatvp-status', async () => {
      const r = await upsertHatvpStatuses(db);
      return {
        source: 'hatvp-status',
        created: r.pending,
        updated: r.checked,
        durationMs: 0,
      };
    }),
  );

  printSummary('HATVP status', results, logger);
  return results;
}
