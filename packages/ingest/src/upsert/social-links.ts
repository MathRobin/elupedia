import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, externalLinks } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { SocialLinkData } from '../sources/an-reseaux-sociaux.js';

export async function upsertSocialLinks(
  db: NeonHttpDatabase,
  links: SocialLinkData[],
) {
  const summary = { created: 0, updated: 0 };

  for (const link of links) {
    const [official] = await db
      .select({ id: officials.id })
      .from(officials)
      .where(eq(officials.anId, link.anId))
      .limit(1);

    if (!official) continue;

    const existing = await db
      .select({ id: externalLinks.id, url: externalLinks.url })
      .from(externalLinks)
      .where(
        and(
          eq(externalLinks.officialId, official.id),
          eq(externalLinks.platform, link.platform),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(externalLinks).values({
        officialId: official.id,
        platform: link.platform,
        url: link.url,
        status: 'published',
        source: 'official',
        capturedAt: new Date().toISOString().slice(0, 10),
      });
      summary.created++;
    } else if (existing[0].url !== link.url) {
      await db
        .update(externalLinks)
        .set({
          url: link.url,
          capturedAt: new Date().toISOString().slice(0, 10),
          updatedAt: new Date(),
        })
        .where(eq(externalLinks.id, existing[0].id));
      summary.updated++;
    }
  }

  return summary;
}
