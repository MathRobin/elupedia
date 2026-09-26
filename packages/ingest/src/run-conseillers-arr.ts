import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchRneConseillersArr } from './sources/rne-conseillers-arr.js';
import { upsertConseillersArr } from './upsert/conseillers-arr.js';

export async function runConseillersArr(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info("=== Ingestion Conseillers d'arrondissement started ===\n");

  if (enabled('conseillers-arr')) {
    logger.info("[1/1] RNE conseillers d'arrondissement...");
    results.push(
      await runStep('conseillers-arr', async () => {
        const conseillers = await withRetry(() => fetchRneConseillersArr(), {
          source: 'rne-conseillers-arr',
        });
        const r = await upsertConseillersArr(db, conseillers);
        return {
          source: 'conseillers-arr',
          created: r.officials,
          updated: r.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary("Ingestion Conseillers d'arrondissement", results, logger);
  return results;
}
