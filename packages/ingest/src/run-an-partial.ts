/**
 * Orchestration de l'ingestion AN « partielle » : seule l'activité
 * parlementaire est rafraîchie, restreinte aux députés en mandat et vivants,
 * et sans les questions dont la réponse date de plus de trois mois (voir
 * filters/partial.ts). Version allégée de l'étape `activity` de run-an.ts,
 * prévue pour tourner fréquemment.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:an:partial`).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * La liste des députés actifs vient de la base (pas de la source AN) : les
 * fiches doivent donc avoir été ingérées par `ingest:an` au préalable.
 */
import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchActivities } from './sources/an-activite.js';
import { upsertParliamentaryActivity } from './upsert/parliamentary-activity.js';
import {
  getActiveDeputyAnIds,
  filterActivitiesForPartial,
  logActivityFilterStats,
} from './filters/partial.js';

/** Lance l'ingestion partielle (une seule étape). Écrit en base. */
export async function runAnPartial(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion AN partielle started ===\n');

  logger.info('[1/2] Fetching active deputies from DB...');
  const startedAt = Date.now();
  const { activeIds, deceasedIds } = await getActiveDeputyAnIds(db);
  logger.info(
    `  Active deputies: ${activeIds.size}, deceased: ${deceasedIds.size} (${Date.now() - startedAt}ms)`,
  );

  logger.info('[2/2] Parliamentary activity (filtered)...');
  results.push(
    await runStep('parliamentary-activity', async () => {
      const activities = await withRetry(() => fetchActivities(), {
        source: 'an-activite',
      });

      const { filtered, stats } = filterActivitiesForPartial(
        activities,
        activeIds,
        deceasedIds,
      );
      logActivityFilterStats(stats);

      const upsert = await upsertParliamentaryActivity(db, filtered);
      return {
        source: 'parliamentary-activity',
        created: upsert.created,
        updated: upsert.updated,
        durationMs: 0,
      };
    }),
  );

  printSummary('Ingestion AN partielle', results, logger);
  return results;
}
