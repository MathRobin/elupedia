import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchRneMaires } from './sources/rne-maires.js';
import { upsertMayors } from './upsert/mayors.js';

export async function runMaires(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion Maires started ===\n');

  if (enabled('maires')) {
    logger.info('[1/1] RNE maires...');
    results.push(
      await runStep('maires', async () => {
        const maires = await withRetry(() => fetchRneMaires(), {
          source: 'rne-maires',
        });
        const r = await upsertMayors(db, maires);
        return {
          source: 'maires',
          created: r.officials,
          updated: r.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion Maires', results, logger);
  return results;
}
