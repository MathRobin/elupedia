import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchRneMaires } from './sources/rne-maires.js';
import { upsertMayors } from './upsert/mayors.js';
import { fetchDilaMairies } from './sources/dila-mairies.js';
import { upsertMayorAddresses } from './upsert/mayor-addresses.js';

export async function runMaires(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion Maires started ===\n');

  if (enabled('maires')) {
    logger.info('[1/2] RNE maires...');
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

  if (enabled('maires-addresses')) {
    logger.info('[2/2] DILA mairie addresses...');
    results.push(
      await runStep('maires-addresses', async () => {
        const mairies = await withRetry(() => fetchDilaMairies(), {
          source: 'dila-mairies',
        });
        const r = await upsertMayorAddresses(db, mairies);
        return {
          source: 'maires-addresses',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion Maires', results, logger);
  return results;
}
