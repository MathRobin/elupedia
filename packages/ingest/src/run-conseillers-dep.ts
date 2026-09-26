import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchRneConseillersDep } from './sources/rne-conseillers-dep.js';
import { upsertConseillersDep } from './upsert/conseillers-dep.js';

export async function runConseillersDep(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion Conseillers départementaux started ===\n');

  if (enabled('conseillers-dep')) {
    logger.info('[1/1] RNE conseillers départementaux...');
    results.push(
      await runStep('conseillers-dep', async () => {
        const conseillers = await withRetry(() => fetchRneConseillersDep(), {
          source: 'rne-conseillers-dep',
        });
        const r = await upsertConseillersDep(db, conseillers);
        return {
          source: 'conseillers-dep',
          created: r.officials,
          updated: r.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion Conseillers départementaux', results, logger);
  return results;
}
