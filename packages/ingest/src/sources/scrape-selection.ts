import { sql, eq, and } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { externalLinks } from '@elupedia/shared';

const SOCIAL_PLATFORMS = ['instagram', 'tiktok', 'youtube'] as const;
const BATCH_SIZE = 50;

export interface ScrapeCandidate {
  officialId: string;
  websiteUrl: string;
}

export async function selectOfficialsToscrape(
  db: NeonHttpDatabase,
): Promise<ScrapeCandidate[]> {
  const rows = await db.execute(sql`
    SELECT
      ws.official_id,
      ws.url AS website_url,
      ws.captured_at
    FROM external_links ws
    WHERE ws.platform = 'personal_website'
      AND ws.status = 'published'
      AND (
        NOT EXISTS (
          SELECT 1 FROM external_links el
          WHERE el.official_id = ws.official_id
            AND el.platform = 'instagram'
            AND el.status = 'published'
        )
        OR NOT EXISTS (
          SELECT 1 FROM external_links el
          WHERE el.official_id = ws.official_id
            AND el.platform = 'tiktok'
            AND el.status = 'published'
        )
        OR NOT EXISTS (
          SELECT 1 FROM external_links el
          WHERE el.official_id = ws.official_id
            AND el.platform = 'youtube'
            AND el.status = 'published'
        )
      )
    ORDER BY ws.captured_at ASC NULLS FIRST
    LIMIT ${BATCH_SIZE}
  `);

  return rows.rows.map((r) => ({
    officialId: r.official_id as string,
    websiteUrl: r.website_url as string,
  }));
}

export async function updateLastScrapedAt(
  db: NeonHttpDatabase,
  officialId: string,
): Promise<void> {
  await db
    .update(externalLinks)
    .set({ capturedAt: new Date().toISOString().slice(0, 10) })
    .where(
      and(
        eq(externalLinks.officialId, officialId),
        eq(externalLinks.platform, 'personal_website'),
      ),
    );
}
