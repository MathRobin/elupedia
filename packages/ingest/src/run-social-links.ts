import { createDb, officials } from '@elupedia/shared';
import { isNotNull } from 'drizzle-orm';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchSocialLinks } from './sources/an-reseaux-sociaux.js';
import { upsertSocialLinks } from './upsert/social-links.js';
import {
  selectOfficialsToscrape,
  updateLastScrapedAt,
} from './sources/scrape-selection.js';
import { scrapePersonalWebsite } from './sources/personal-website-scraper.js';
import { upsertScrapedLinks } from './upsert/scraped-links.js';
import { scrapeAnFicheSociale } from './sources/an-fiche-sociale.js';

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
      const r = await upsertSocialLinks(db, links);
      return {
        source: 'social-links',
        created: r.created,
        updated: r.updated,
        durationMs: 0,
      };
    }),
  );

  logger.info('[2/3] AN individual deputy pages (Instagram, etc.)...');
  results.push(
    await runStep('an-fiche-sociale', async () => {
      const rows = await db
        .select({ anId: officials.anId })
        .from(officials)
        .where(isNotNull(officials.anId));

      logger.info(`  ${rows.length} deputies to scrape`);

      let created = 0;
      let updated = 0;
      let errors = 0;

      for (const row of rows) {
        try {
          const links = await withRetry(() => scrapeAnFicheSociale(row.anId!), {
            source: 'an-fiche-sociale',
            maxAttempts: 2,
            baseDelayMs: 2000,
          });
          const r = await upsertSocialLinks(db, links);
          created += r.created;
          updated += r.updated;
        } catch (err) {
          errors++;
          logger.warn(`  Failed for ${row.anId}: ${err}`);
        }
        await new Promise((r) => setTimeout(r, 300));
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
      const candidates = await selectOfficialsToscrape(db);
      logger.info(`  ${candidates.length} officials to scrape`);

      let created = 0;
      let skipped = 0;

      for (const candidate of candidates) {
        try {
          const links = await scrapePersonalWebsite(candidate.websiteUrl);
          const r = await upsertScrapedLinks(db, candidate.officialId, links);
          created += r.created;
          skipped += r.skipped;
          await updateLastScrapedAt(db, candidate.officialId);
        } catch (err) {
          logger.warn(`  Scrape failed for ${candidate.websiteUrl}: ${err}`);
        }
      }

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
