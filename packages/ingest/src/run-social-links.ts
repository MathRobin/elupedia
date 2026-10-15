/**
 * Orchestration de l'ingestion des liens vers les réseaux sociaux, en trois
 * étapes de couverture décroissante :
 *   1. pages de listing de l'AN (tous les députés d'un coup) ;
 *   2. fiche AN de chaque député (liens absents des listings, ex. Instagram) ;
 *   3. scraping du site personnel d'un lot d'élus, toutes origines
 *      confondues (sources/scrape-selection.ts choisit le lot).
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:social-links`).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * Les étapes 2 et 3 enchaînent des centaines de requêtes HTTP : une erreur
 * sur un élu est loguée et n'arrête pas la boucle.
 */
import { createDb, officials } from '@elupedia/shared';
import { isNotNull } from 'drizzle-orm';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchSocialLinks } from './sources/an-reseaux-sociaux.js';
import { upsertSocialLinks } from './upsert/social-links.js';
import {
  selectOfficialsToScrape,
  updateLastScrapedAt,
} from './sources/scrape-selection.js';
import { scrapePersonalWebsite } from './sources/personal-website-scraper.js';
import { upsertScrapedLinks } from './upsert/scraped-links.js';
import { scrapeAnFicheSociale } from './sources/an-fiche-sociale.js';

// Pause entre deux fiches AN (site institutionnel, pas de quota documenté).
const DELAY_BETWEEN_AN_PAGES_MS = 300;

/** Lance les trois étapes. Écrit en base. */
export async function runSocialLinks(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Social links ingestion started ===\n');

  logger.info('[1/3] AN social links (listing pages)...');
  results.push(
    await runStep('social-links', async () => {
      const links = await withRetry(() => fetchSocialLinks(), {
        source: 'an-reseaux-sociaux',
      });
      const upsert = await upsertSocialLinks(db, links);
      return {
        source: 'social-links',
        created: upsert.created,
        updated: upsert.updated,
        durationMs: 0,
      };
    }),
  );

  logger.info('[2/3] AN individual deputy pages (Instagram, etc.)...');
  results.push(
    await runStep('an-fiche-sociale', async () => {
      // Tous les élus ayant un identifiant AN, mandat en cours ou non.
      const deputies = await db
        .select({ anId: officials.anId })
        .from(officials)
        .where(isNotNull(officials.anId));

      logger.info(`  ${deputies.length} deputies to scrape`);

      let created = 0;
      let updated = 0;
      let errors = 0;

      for (const deputy of deputies) {
        try {
          const links = await withRetry(
            () => scrapeAnFicheSociale(deputy.anId!),
            { source: 'an-fiche-sociale', maxAttempts: 2, baseDelayMs: 2000 },
          );
          const upsert = await upsertSocialLinks(db, links);
          created += upsert.created;
          updated += upsert.updated;
        } catch (error) {
          errors++;
          logger.warn(`  Failed for ${deputy.anId}: ${error}`);
        }
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_AN_PAGES_MS),
        );
      }

      if (errors > 0) logger.warn(`  ${errors} errors`);
      return {
        source: 'an-fiche-sociale',
        created,
        updated,
        durationMs: 0,
      };
    }),
  );

  logger.info('[3/3] Personal website scraping (batch 50)...');
  results.push(
    await runStep('personal-website-scrape', async () => {
      const candidates = await selectOfficialsToScrape(db);
      logger.info(`  ${candidates.length} officials to scrape`);

      let created = 0;
      let skipped = 0;

      for (const candidate of candidates) {
        try {
          const links = await scrapePersonalWebsite(candidate.websiteUrl);
          const upsert = await upsertScrapedLinks(
            db,
            candidate.officialId,
            links,
          );
          created += upsert.created;
          skipped += upsert.skipped;
          // Daté seulement en cas de succès : un site en erreur reste
          // candidat au prochain lot.
          await updateLastScrapedAt(db, candidate.officialId);
        } catch (error) {
          logger.warn(`  Scrape failed for ${candidate.websiteUrl}: ${error}`);
        }
      }

      // Pas de colonne « ignorés » dans StepResult : on recycle `updated`.
      return {
        source: 'personal-website-scrape',
        created,
        updated: skipped,
        durationMs: 0,
      };
    }),
  );

  printSummary('Social links ingestion', results, logger);
  return results;
}
