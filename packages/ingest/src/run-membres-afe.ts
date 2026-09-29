import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchRneMembresAfe } from './sources/rne-membres-afe.js';
import { upsertMembresAfe } from './upsert/membres-afe.js';

export async function runMembresAfe(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info(
    "=== Ingestion Membres de l'Assemblée des Français de l'étranger started ===\n",
  );

  if (enabled('membres-afe')) {
    logger.info(
      "[1/1] RNE membres de l'Assemblée des Français de l'étranger...",
    );
    results.push(
      await runStep('membres-afe', async () => {
        const membres = await withRetry(() => fetchRneMembresAfe(), {
          source: 'rne-membres-afe',
        });
        const r = await upsertMembresAfe(db, membres);
        return {
          source: 'membres-afe',
          created: r.officials,
          updated: r.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary(
    "Ingestion Membres de l'Assemblée des Français de l'étranger",
    results,
    logger,
  );
  return results;
}
