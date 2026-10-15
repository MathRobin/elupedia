import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchRneConseillersEpci } from './sources/rne-conseillers-epci.js';
import { upsertConseillersEpci } from './upsert/conseillers-epci.js';

export async function runConseillersEpci(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion Conseillers communautaires started ===\n');

  if (enabled('conseillers-epci')) {
    logger.info('[1/1] RNE conseillers communautaires...');
    results.push(
      await runStep('conseillers-epci', async () => {
        const conseillers = await withRetry(() => fetchRneConseillersEpci(), {
          source: 'rne-conseillers-epci',
        });
        const r = await upsertConseillersEpci(db, conseillers);
        return {
          source: 'conseillers-epci',
          created: r.officials,
          updated: r.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion Conseillers communautaires', results, logger);
  return results;
}
