/**
 * Orchestration de la vérification des statuts de déclaration HATVP : tout
 * le travail (sélection des élus, appels HATVP, écriture) est dans
 * upsert/hatvp-status.ts, ce fichier ne fait que l'habiller en StepResult.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:hatvp-status`) et par run.ts (run complet).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 */
import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { upsertHatvpStatuses } from './upsert/hatvp-status.js';

/** Lance la vérification des statuts HATVP (une seule étape). Écrit en base. */
export async function runHatvpStatus(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== HATVP declaration status check started ===\n');

  results.push(
    await runStep('hatvp-status', async () => {
      const statuses = await upsertHatvpStatuses(db);
      // created = déclarations en attente, updated = statuts vérifiés.
      return {
        source: 'hatvp-status',
        created: statuses.pending,
        updated: statuses.checked,
        durationMs: 0,
      };
    }),
  );

  printSummary('HATVP status', results, logger);
  return results;
}
