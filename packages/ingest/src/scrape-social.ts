import 'dotenv/config';
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
  console.log(`[scrape] ${candidates.length} officials to scrape`);

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
        console.log(
          `  ${candidate.websiteUrl}: ${links.length} links found, ${result.created} inserted`,
        );
      }
    } catch (err) {
      console.error(`  Error scraping ${candidate.websiteUrl}:`, err);
    }
  }

  console.log(
    `[scrape] Done: ${totalCreated} created, ${totalSkipped} skipped`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
