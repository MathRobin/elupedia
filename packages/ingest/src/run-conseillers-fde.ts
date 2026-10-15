/**
 * Orchestration de l'ingestion des conseillers des Français de l'étranger :
 * lit l'export RNE puis crée/met à jour fiches et mandats.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:conseillers-fde`).
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
        const upsert = await upsertConseillersFde(db, conseillers);
        // created = fiches officials touchées, updated = mandats touchés.
        return {
          source: 'conseillers-fde',
          created: upsert.officials,
          updated: upsert.mandates,
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
