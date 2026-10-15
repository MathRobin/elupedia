/**
 * Orchestration de l'ingestion des fact-checks : pour chaque élu ciblé, une
 * requête « Prénom Nom » sur l'API Google Fact Check Tools, puis upsert des
 * articles trouvés (upsert/fact-checks.ts).
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:factchecks`).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * Périmètre : tous les députés et sénateurs (mandats clos compris) plus tout
 * élu ayant un mandat en cours. Sans GOOGLE_FACTCHECK_API_KEY, le run est
 * ignoré (log d'erreur, aucun StepResult, code de sortie 0 côté main).
 */
import { createDb, officials, mandates } from '@elupedia/shared';
import { isNull, eq, or } from 'drizzle-orm';

import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { searchFactChecks } from './sources/google-factcheck.js';
import { upsertFactChecks } from './upsert/fact-checks.js';

// Pause entre deux requêtes à l'API Google (quota journalier limité).
const DELAY_BETWEEN_QUERIES_MS = 200;
// Fréquence (en nombre d'élus traités) des lignes de progression.
const PROGRESS_LOG_EVERY = 100;

/** Lance l'ingestion des fact-checks (une seule étape). Écrit en base. */
export async function runFactChecks(): Promise<StepResult[]> {
  const apiKey = process.env.GOOGLE_FACTCHECK_API_KEY;
  if (!apiKey) {
    logger.error('GOOGLE_FACTCHECK_API_KEY is not set');
    return [];
  }

  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Fact-check ingestion started ===\n');

  results.push(
    await runStep('factchecks', async () => {
      // groupBy = un élu une seule fois, même avec plusieurs mandats
      // qualifiants.
      const targets = await db
        .select({
          id: officials.id,
          firstName: officials.firstName,
          lastName: officials.lastName,
        })
        .from(officials)
        .innerJoin(mandates, eq(mandates.officialId, officials.id))
        .where(
          or(
            eq(mandates.type, 'depute'),
            eq(mandates.type, 'senateur'),
            isNull(mandates.endDate),
          ),
        )
        .groupBy(officials.id, officials.firstName, officials.lastName);

      logger.info(`  ${targets.length} officials to query`);

      let totalCreated = 0;
      let totalUpdated = 0;
      let errors = 0;
      let queried = 0;

      for (const official of targets) {
        try {
          const query = `${official.firstName} ${official.lastName}`;
          const items = await searchFactChecks(query, apiKey);

          if (items.length > 0) {
            const upsert = await upsertFactChecks(db, official.id, items);
            totalCreated += upsert.created;
            totalUpdated += upsert.updated;
            if (upsert.created > 0) {
              logger.info(
                `  ${official.firstName} ${official.lastName}: ${upsert.created} new, ${upsert.updated} updated`,
              );
            }
          }

          queried++;
          if (queried % PROGRESS_LOG_EVERY === 0) {
            logger.info(
              `  Progress: ${queried}/${targets.length} (${totalCreated} new)`,
            );
          }
        } catch (error) {
          errors++;
          logger.warn(
            `  Error for ${official.firstName} ${official.lastName}: ${error}`,
          );
        } finally {
          // Marqué comme vérifié même en cas d'erreur, pour ne pas bloquer
          // indéfiniment cet élu (voir même logique sur pressCheckedAt).
          await db
            .update(officials)
            .set({ factchecksCheckedAt: new Date() })
            .where(eq(officials.id, official.id));
        }
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_QUERIES_MS),
        );
      }

      if (errors > 0) logger.warn(`  ${errors} errors`);
      return {
        source: 'factchecks',
        created: totalCreated,
        updated: totalUpdated,
        durationMs: 0,
      };
    }),
  );

  printSummary('Fact-check ingestion', results, logger);
  return results;
}
