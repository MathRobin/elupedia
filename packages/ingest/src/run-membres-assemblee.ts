import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchRneMembresAssemblee } from './sources/rne-membres-assemblee.js';
import { upsertMembresAssemblee } from './upsert/membres-assemblee.js';

export async function runMembresAssemblee(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info(
    '=== Ingestion Membres assemblée statut particulier started ===\n',
  );

  if (enabled('membres-assemblee')) {
    logger.info('[1/1] RNE membres assemblée statut particulier...');
    results.push(
      await runStep('membres-assemblee', async () => {
        const membres = await withRetry(() => fetchRneMembresAssemblee(), {
          source: 'rne-membres-assemblee',
        });
        const r = await upsertMembresAssemblee(db, membres);
        return {
          source: 'membres-assemblee',
          created: r.officials,
          updated: r.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary(
    'Ingestion Membres assemblée statut particulier',
    results,
    logger,
  );
  return results;
}
