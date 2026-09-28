import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchRneConseillersFde } from './sources/rne-conseillers-fde.js';
import { upsertConseillersFde } from './upsert/conseillers-fde.js';

export async function runConseillersFde(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info(
    "=== Ingestion Conseillers des Français de l'étranger started ===\n",
  );

  if (enabled('conseillers-fde')) {
    logger.info("[1/1] RNE conseillers des Français de l'étranger...");
    results.push(
      await runStep('conseillers-fde', async () => {
        const conseillers = await withRetry(() => fetchRneConseillersFde(), {
          source: 'rne-conseillers-fde',
        });
        const r = await upsertConseillersFde(db, conseillers);
        return {
          source: 'conseillers-fde',
          created: r.officials,
          updated: r.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary(
    "Ingestion Conseillers des Français de l'étranger",
    results,
    logger,
  );
  return results;
}
