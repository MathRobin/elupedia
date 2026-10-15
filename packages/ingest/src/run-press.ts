/**
 * Orchestration de l'ingestion presse des parlementaires : pour chaque
 * député, sénateur ou eurodéputé vivant et en mandat, une recherche Google
 * Actualités (sources/google-news.ts) puis upsert des articles.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:press`).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * Contrairement à run-press-maires.ts, aucun lot ni date de dernière
 * vérification : tous les parlementaires sont parcourus à chaque run, avec
 * une pause DELAY_MS entre deux élus pour ne pas être bloqué par Google.
 */
import { createDb, officials, mandates } from '@elupedia/shared';
import { isNull, and, inArray, eq } from 'drizzle-orm';

import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchPressMentions } from './sources/google-news.js';
import { upsertPressMentions } from './upsert/press-mentions.js';

// Pause entre deux recherches Google Actualités (flux RSS non officiel,
// bloque rapidement les rafales).
const DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lance l'ingestion presse des parlementaires (une seule étape). Écrit en base. */
export async function runPress(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Press ingestion started ===\n');

  const livingOfficials = await db
    .selectDistinct({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials)
    .innerJoin(mandates, eq(mandates.officialId, officials.id))
    .where(
      and(
        isNull(officials.deathDate),
        inArray(mandates.type, ['depute', 'senateur', 'eurodepute']),
        isNull(mandates.endDate),
      ),
    );

  logger.info(
    `${livingOfficials.length} living parliamentarians to process (députés, sénateurs, eurodéputés)\n`,
  );

  results.push(
    await runStep('google-news', async () => {
      let totalCreated = 0;
      let totalUpdated = 0;

      for (let i = 0; i < livingOfficials.length; i++) {
        const official = livingOfficials[i];
        logger.info(
          `  [${i + 1}/${livingOfficials.length}] ${official.lastName}`,
        );

        try {
          const mentions = await fetchPressMentions(
            official.id,
            official.firstName,
            official.lastName,
          );
          const upsert = await upsertPressMentions(db, mentions);
          totalCreated += upsert.created;
          totalUpdated += upsert.updated;
          logger.info(
            `    → ${mentions.length} articles, ${upsert.created} new`,
          );
        } catch (err) {
          logger.warn(
            `    → error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        if (i < livingOfficials.length - 1) {
          await sleep(DELAY_MS);
        }
      }

      return {
        source: 'google-news',
        created: totalCreated,
        updated: totalUpdated,
        durationMs: 0,
      };
    }),
  );

  printSummary('Press ingestion', results, logger);
  return results;
}
