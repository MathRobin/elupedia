import { createDb } from '@elupedia/shared';

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

export async function runSocialLinks(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Social links ingestion started ===\n');

  logger.info('[1/2] AN social links (2 pages)...');
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

  logger.info('[2/2] Personal website scraping (batch 50)...');
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
