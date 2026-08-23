import { eq, and, inArray } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { externalLinks } from '@elupedia/shared';
import type { DetectedLink } from '../sources/personal-website-scraper.js';

export async function upsertScrapedLinks(
  db: NeonHttpDatabase,
  officialId: string,
  links: DetectedLink[],
): Promise<{ created: number; skipped: number }> {
  if (links.length === 0) return { created: 0, skipped: 0 };

  const platforms = links.map((l) => l.platform);

  const existing = await db
    .select({
      platform: externalLinks.platform,
      status: externalLinks.status,
    })
    .from(externalLinks)
    .where(
      and(
        eq(externalLinks.officialId, officialId),
        inArray(externalLinks.platform, platforms),
      ),
    );

  const excludedPlatforms = new Set(
    existing
      .filter(
        (e) =>
          e.status === 'rejected' ||
          e.status === 'deleted' ||
          e.status === 'published' ||
          e.status === 'pending',
      )
      .map((e) => e.platform),
  );

  const toInsert = links.filter((l) => !excludedPlatforms.has(l.platform));

  const today = new Date().toISOString().slice(0, 10);

  for (const link of toInsert) {
    await db.insert(externalLinks).values({
      officialId,
      platform: link.platform,
      url: link.url,
      status: 'pending',
      source: 'scraped_personal_website',
      capturedAt: today,
    });
  }

  return { created: toInsert.length, skipped: links.length - toInsert.length };
}
