import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, externalLinks } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { SocialLinkData } from '../sources/an-reseaux-sociaux.js';

export async function upsertSocialLinks(
  db: NeonHttpDatabase,
  links: SocialLinkData[],
) {
  const summary = { created: 0, updated: 0 };

  const allOfficials = await db
    .select({ id: officials.id, anId: officials.anId })
    .from(officials);
  const officialByAnId = new Map<string, string>();
  for (const o of allOfficials) {
    if (o.anId) officialByAnId.set(o.anId, o.id);
  }

  const allLinks = await db
    .select({
      id: externalLinks.id,
      officialId: externalLinks.officialId,
      platform: externalLinks.platform,
      url: externalLinks.url,
    })
    .from(externalLinks);
  const existingByKey = new Map<string, { id: string; url: string }>();
  for (const l of allLinks) {
    existingByKey.set(`${l.officialId}|${l.platform}`, l);
  }

  const newRows: (typeof externalLinks.$inferInsert)[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const link of links) {
    const officialId = officialByAnId.get(link.anId);
    if (!officialId) continue;

    const existing = existingByKey.get(`${officialId}|${link.platform}`);

    if (!existing) {
      newRows.push({
        officialId,
        platform: link.platform,
        url: link.url,
        status: 'published',
        source: 'official',
        capturedAt: today,
      });
      summary.created++;
    } else if (existing.url !== link.url) {
      await db
        .update(externalLinks)
        .set({
          url: link.url,
          capturedAt: today,
          updatedAt: new Date(),
        })
        .where(eq(externalLinks.id, existing.id));
      summary.updated++;
    }
  }

  if (newRows.length > 0) {
    await db.insert(externalLinks).values(newRows);
  }

  return summary;
}
