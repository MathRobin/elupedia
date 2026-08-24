import 'dotenv/config';
import { logger } from './logger.js';
import { createDb } from '@elupedia/shared';
import {
  selectOfficialsToscrape,
  updateLastScrapedAt,
} from './sources/scrape-selection.js';
import { scrapePersonalWebsite } from './sources/personal-website-scraper.js';
import { upsertScrapedLinks } from './upsert/scraped-links.js';

async function main() {
  const db = createDb();
  const candidates = await selectOfficialsToscrape(db);
  logger.info(`[scrape] ${candidates.length} officials to scrape`);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const candidate of candidates) {
    try {
      const links = await scrapePersonalWebsite(candidate.websiteUrl);
      const result = await upsertScrapedLinks(db, candidate.officialId, links);
      await updateLastScrapedAt(db, candidate.officialId);
      totalCreated += result.created;
      totalSkipped += result.skipped;
      if (links.length > 0) {
        logger.info(`${candidate.websiteUrl}: ${links.length} links found, ${result.created} inserted`);
      }
    } catch (err) {
      logger.error(`Error scraping ${candidate.websiteUrl}: ${err}`);
    }
  }

  logger.info(`[scrape] Done: ${totalCreated} created, ${totalSkipped} skipped`);
}

main().catch((err) => {
  logger.error(`${err}`);
  process.exit(1);
});
