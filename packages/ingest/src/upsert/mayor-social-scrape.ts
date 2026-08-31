import { sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { scrapePersonalWebsite } from '../sources/personal-website-scraper.js';
import { upsertScrapedLinks } from './scraped-links.js';
import { logger } from '../logger.js';

interface MayorScrapeCandidate {
  officialId: string;
  websiteUrl: string;
}

const BATCH_SIZE = 100;

export async function selectMayorWebsites(
  db: NeonHttpDatabase,
): Promise<MayorScrapeCandidate[]> {
  const rows = await db.execute(sql`
    SELECT
      el.official_id,
      el.url AS website_url
    FROM external_links el
    JOIN mandates m ON m.official_id = el.official_id AND m.type = 'maire'
    WHERE el.platform = 'official_page'
      AND el.status = 'published'
      AND NOT EXISTS (
        SELECT 1 FROM external_links el2
        WHERE el2.official_id = el.official_id
          AND el2.platform IN ('instagram', 'tiktok', 'youtube')
      )
    ORDER BY el.captured_at ASC NULLS FIRST
    LIMIT ${BATCH_SIZE}
  `);

  return rows.rows.map((r) => ({
    officialId: r.official_id as string,
    websiteUrl: r.website_url as string,
  }));
}

const DELAY_MS = 2000;

export async function scrapeMayorWebsites(
  db: NeonHttpDatabase,
  fetchFn = globalThis.fetch,
): Promise<{ created: number; skipped: number; errors: number }> {
  const candidates = await selectMayorWebsites(db);
  logger.info(`  Mayor websites to scrape: ${candidates.length}`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    try {
      const links = await scrapePersonalWebsite(candidate.websiteUrl, fetchFn);
      const r = await upsertScrapedLinks(db, candidate.officialId, links);
      created += r.created;
      skipped += r.skipped;
    } catch (err) {
      logger.warn(`  Scrape failed for ${candidate.websiteUrl}: ${err}`);
      errors++;
    }

    if (i < candidates.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  logger.info(
    `Mayor website scrape: ${created} links created, ${skipped} skipped, ${errors} errors`,
  );
  return { created, skipped, errors };
}
