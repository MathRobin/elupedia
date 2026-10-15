/**
 * Orchestration de l'ingestion des membres des assemblées à statut particulier
 * (Corse, Guyane, DOM-TOM, Métropole de Lyon) : lit l'export RNE puis
 * crée/met à jour fiches et mandats.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:membres-assemblee`) et par run.ts (run complet).
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
        const upsert = await upsertMembresAssemblee(db, membres);
        // created = fiches officials touchées, updated = mandats touchés.
        return {
          source: 'membres-assemblee',
          created: upsert.officials,
          updated: upsert.mandates,
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
