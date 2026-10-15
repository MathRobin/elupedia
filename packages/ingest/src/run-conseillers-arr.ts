/**
 * Orchestration de l'ingestion des conseillers d'arrondissement (Paris, Lyon,
 * Marseille) : lit l'export RNE puis crée/met à jour fiches et mandats.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:conseillers-arr`) et par run.ts (run complet).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * Une seule étape, mais le filtrage par `enabledSteps` est conservé pour
 * rester homogène avec les autres run-*.ts (et avec --only/--skip).
 */
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
        const upsert = await upsertConseillersArr(db, conseillers);
        // created = fiches officials touchées, updated = mandats touchés.
        return {
          source: 'conseillers-arr',
          created: upsert.officials,
          updated: upsert.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary("Ingestion Conseillers d'arrondissement", results, logger);
  return results;
}
