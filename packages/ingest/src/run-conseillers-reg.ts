/**
 * Orchestration de l'ingestion des conseillers régionaux : lit l'export RNE
 * puis crée/met à jour fiches et mandats.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:conseillers-reg`) et par run.ts (run complet).
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
        const upsert = await upsertConseillersReg(db, conseillers);
        // created = fiches officials touchées, updated = mandats touchés.
        return {
          source: 'conseillers-reg',
          created: upsert.officials,
          updated: upsert.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion Conseillers régionaux', results, logger);
  return results;
}
