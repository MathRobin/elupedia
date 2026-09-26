import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchRneConseillersReg } from './sources/rne-conseillers-reg.js';
import { upsertConseillersReg } from './upsert/conseillers-reg.js';

export async function runConseillersReg(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion Conseillers régionaux started ===\n');

  if (enabled('conseillers-reg')) {
    logger.info('[1/1] RNE conseillers régionaux...');
    results.push(
      await runStep('conseillers-reg', async () => {
        const conseillers = await withRetry(() => fetchRneConseillersReg(), {
          source: 'rne-conseillers-reg',
        });
        const r = await upsertConseillersReg(db, conseillers);
        return {
          source: 'conseillers-reg',
          created: r.officials,
          updated: r.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion Conseillers régionaux', results, logger);
  return results;
}
