/**
 * Orchestration de l'ingestion des conseillers départementaux : lit l'export
 * RNE puis crée/met à jour fiches et mandats.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:conseillers-dep`) et par run.ts (run complet).
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
import { fetchRneConseillersDep } from './sources/rne-conseillers-dep.js';
import { upsertConseillersDep } from './upsert/conseillers-dep.js';

export async function runConseillersDep(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion Conseillers départementaux started ===\n');

  if (enabled('conseillers-dep')) {
    logger.info('[1/1] RNE conseillers départementaux...');
    results.push(
      await runStep('conseillers-dep', async () => {
        const conseillers = await withRetry(() => fetchRneConseillersDep(), {
          source: 'rne-conseillers-dep',
        });
        const upsert = await upsertConseillersDep(db, conseillers);
        // created = fiches officials touchées, updated = mandats touchés.
        return {
          source: 'conseillers-dep',
          created: upsert.officials,
          updated: upsert.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion Conseillers départementaux', results, logger);
  return results;
}
