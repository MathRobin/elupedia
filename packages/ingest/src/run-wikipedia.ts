/**
 * Orchestration de la recherche de pages Wikipédia (fr) : pour chaque élu
 * ciblé sans lien `wikipedia_fr` dans `external_links`, interroge l'API
 * Wikipédia (sources/wikipedia.ts) et insère le lien trouvé. Seul run-*.ts
 * qui écrit directement en base, sans module upsert/.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:wikipedia`).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * Périmètre : députés, sénateurs et maires (mandats clos compris) plus tout
 * élu ayant un mandat en cours. Les liens déjà présents ne sont jamais
 * modifiés : un élu avec un lien est simplement sauté.
 */
import { createDb, officials, externalLinks, mandates } from '@elupedia/shared';
import { eq, and, or, isNull } from 'drizzle-orm';

import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { withRetry } from './utils/retry.js';
import { findWikipediaUrl } from './sources/wikipedia.js';

// Pause entre deux appels à l'API Wikipédia (politesse, pas de quota strict).
const DELAY_BETWEEN_QUERIES_MS = 500;
// Fréquence (en nombre d'élus traités) des lignes de progression.
const PROGRESS_LOG_EVERY = 100;

/** Lance la recherche Wikipédia (une seule étape). Écrit en base. */
export async function runWikipedia(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Wikipedia ingestion started ===\n');

  results.push(
    await runStep('wikipedia', async () => {
      const existingWiki = await db
        .select({ officialId: externalLinks.officialId })
        .from(externalLinks)
        .where(eq(externalLinks.platform, 'wikipedia_fr'));
      const alreadyHasWiki = new Set(
        existingWiki.map((link) => link.officialId),
      );

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
            eq(mandates.type, 'maire'),
            isNull(mandates.endDate),
          ),
        )
        .groupBy(officials.id, officials.firstName, officials.lastName);

      const candidates = targets.filter(
        (official) => !alreadyHasWiki.has(official.id),
      );
      logger.info(
        `  ${targets.length} officials total, ${candidates.length} without Wikipedia link`,
      );

      let created = 0;
      let errors = 0;
      let queried = 0;

      for (const official of candidates) {
        try {
          const url = await withRetry(
            () => findWikipediaUrl(official.firstName, official.lastName),
            { source: 'wikipedia', maxAttempts: 2, baseDelayMs: 2000 },
          );

          if (url) {
            // Re-vérifié juste avant l'insert (pas de contrainte unique sur
            // official_id + platform) : un run concurrent ou un retry de
            // runStep ne doit pas créer de doublon.
            const existing = await db
              .select({ id: externalLinks.id })
              .from(externalLinks)
              .where(
                and(
                  eq(externalLinks.officialId, official.id),
                  eq(externalLinks.platform, 'wikipedia_fr'),
                ),
              )
              .limit(1);

            if (existing.length === 0) {
              await db.insert(externalLinks).values({
                officialId: official.id,
                platform: 'wikipedia_fr',
                url,
                status: 'published',
                source: 'wikipedia_api',
                capturedAt: new Date().toISOString().slice(0, 10),
              });
              created++;
              logger.info(
                `  + ${official.firstName} ${official.lastName}: ${url}`,
              );
            }
          }

          queried++;
          if (queried % PROGRESS_LOG_EVERY === 0) {
            logger.info(
              `  Progress: ${queried}/${candidates.length} (${created} found)`,
            );
          }
        } catch (error) {
          errors++;
          logger.warn(
            `  Error for ${official.firstName} ${official.lastName}: ${error}`,
          );
        }
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_QUERIES_MS),
        );
      }

      if (errors > 0) logger.warn(`  ${errors} errors`);
      return {
        source: 'wikipedia',
        created,
        updated: 0,
        durationMs: 0,
      };
    }),
  );

  printSummary('Wikipedia ingestion', results, logger);
  return results;
}
