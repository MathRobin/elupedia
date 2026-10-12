/**
 * Orchestration de l'ingestion des déclarations d'intérêts HATVP : un seul
 * export open data, exploité deux fois — les intérêts détaillés par élu
 * (upsert/interests.ts) et un instantané de chaque déclaration pour suivre
 * les modifications dans le temps (upsert/declaration-snapshots.ts).
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:interests`) et par run.ts (run complet).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * Transverse : concerne députés, sénateurs, eurodéputés et exécutifs
 * locaux, rattachés par nom dans les upserts.
 */
import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchDeclarations } from './sources/hatvp.js';
import { upsertInterests } from './upsert/interests.js';
import { upsertDeclarationSnapshots } from './upsert/declaration-snapshots.js';

/** Lance l'ingestion HATVP (une seule étape). Écrit en base. */
export async function runInterests(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion HATVP interests started ===\n');

  results.push(
    await runStep('interests', async () => {
      const declarations = await withRetry(() => fetchDeclarations(), {
        source: 'hatvp',
      });
      const interestsUpsert = await upsertInterests(db, declarations);
      const snapshotsUpsert = await upsertDeclarationSnapshots(
        db,
        declarations,
      );
      return {
        source: 'interests',
        created: interestsUpsert.created + snapshotsUpsert.created,
        updated: interestsUpsert.updated + snapshotsUpsert.updated,
        durationMs: 0,
      };
    }),
  );

  printSummary('Ingestion HATVP interests', results, logger);
  return results;
}
