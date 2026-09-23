import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchSenatorialCandidacies2026 } from './sources/senat-candidacies-2026.js';
import { upsertSenatorialCandidacies } from './upsert/senat-candidacies.js';

export async function runSenatCandidacies(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Sénatoriales 2026 : candidatures ===\n');

  results.push(
    await runStep('senat-candidacies-2026', async () => {
      const departements = await fetchSenatorialCandidacies2026();
      logger.info(`  ${departements.length} circonscriptions récupérées`);

      const summary = await upsertSenatorialCandidacies(db, departements);

      return {
        source: 'senat-candidacies-2026',
        created: summary.candidates,
        updated: 0,
        durationMs: 0,
      };
    }),
  );

  printSummary('Sénatoriales 2026 : candidatures', results, logger);
  return results;
}
