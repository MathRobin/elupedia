import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, externalLinks } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { SenatSocialLinkData } from '../sources/senat-reseaux-sociaux.js';
import { logger } from '../logger.js';

export async function upsertSenatSocialLinks(
  db: NeonHttpDatabase,
  links: SenatSocialLinkData[],
) {
  const summary = { created: 0, updated: 0, skipped: 0 };

  const officialRows = await db
    .select({ id: officials.id, senatId: officials.senatId })
    .from(officials);

  const officialByMatricule = new Map<string, string>();
  for (const row of officialRows) {
    if (row.senatId) {
      officialByMatricule.set(row.senatId.trim(), row.id);
    }
  }

  logger.info(
    `  Officials cache: ${officialByMatricule.size} sénateurs mappés`,
  );

  for (const link of links) {
    const officialId = officialByMatricule.get(link.matricule.trim());
    if (!officialId) {
      summary.skipped++;
      continue;
    }

    const existing = await db
      .select({ id: externalLinks.id, url: externalLinks.url })
      .from(externalLinks)
      .where(
        and(
          eq(externalLinks.officialId, officialId),
          eq(externalLinks.platform, link.platform),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(externalLinks).values({
        officialId,
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
        })
        .where(eq(externalLinks.id, existing[0].id));
      summary.updated++;
    }
  }

  logger.info(
    `Sénat social links: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`,
  );
  return summary;
}
