import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchSenatorialResults2026 } from './sources/senat-resultats-2026.js';
import { upsertSenatorialResults2026 } from './upsert/senat-resultats-2026.js';
import { upsertSenatMandats2026 } from './upsert/senat-mandats-2026.js';

export async function runSenatResultats(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Sénatoriales 2026 : résultats post-scrutin ===\n');

  const departements = await fetchSenatorialResults2026();
  logger.info(
    `  ${departements.length} circonscriptions dépouillées récupérées`,
  );

  results.push(
    await runStep('senat-resultats-2026', async () => {
      const summary = await upsertSenatorialResults2026(db, departements);
      return {
        source: 'senat-resultats-2026',
        created: summary.candidates,
        updated: 0,
        durationMs: 0,
      };
    }),
  );

  results.push(
    await runStep('senat-mandats-2026', async () => {
      const summary = await upsertSenatMandats2026(db, departements);
      return {
        source: 'senat-mandats-2026',
        created: summary.officialsCreated + summary.mandatesOpened,
        updated: summary.mandatesClosed,
        durationMs: 0,
      };
    }),
  );

  printSummary('Sénatoriales 2026 : résultats post-scrutin', results, logger);
  return results;
}
