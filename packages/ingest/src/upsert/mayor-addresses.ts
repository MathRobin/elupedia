import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { mandates, addresses, externalLinks } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { MairieData } from '../sources/dila-mairies.js';
import { logger } from '../logger.js';

const BATCH_SIZE = 2000;

export async function upsertMayorAddresses(
  db: NeonHttpDatabase,
  mairies: MairieData[],
) {
  const summary = { created: 0, updated: 0, websites: 0, skipped: 0 };

  const mayorMandates = await db
    .select({
      officialId: mandates.officialId,
      communeCode: mandates.communeCode,
    })
    .from(mandates)
    .where(eq(mandates.type, 'maire'));

  const officialByCommune = new Map<string, string>();
  for (const m of mayorMandates) {
    if (m.communeCode) {
      officialByCommune.set(m.communeCode, m.officialId);
    }
  }

  logger.info(`  Mayor mandates cache: ${officialByCommune.size} communes`);

  for (let start = 0; start < mairies.length; start += BATCH_SIZE) {
    const batch = mairies.slice(start, start + BATCH_SIZE);
    logger.info(
      `  Processing batch ${Math.floor(start / BATCH_SIZE) + 1}/${Math.ceil(mairies.length / BATCH_SIZE)} (${batch.length} mairies)`,
    );

    for (const mairie of batch) {
      const officialId = officialByCommune.get(mairie.communeCode);
      if (!officialId) {
        summary.skipped++;
        continue;
      }

      const existing = await db
        .select({ id: addresses.id })
        .from(addresses)
        .where(
          and(
            eq(addresses.officialId, officialId),
            eq(addresses.type, 'town_hall'),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(addresses).values({
          officialId,
          type: 'town_hall',
          street: mairie.street || null,
          postalCode: mairie.postalCode || null,
          city: mairie.city || null,
          phone: mairie.phone ?? null,
          email: mairie.email ?? null,
        });
        summary.created++;
      } else {
        await db
          .update(addresses)
          .set({
            street: mairie.street || null,
            postalCode: mairie.postalCode || null,
            city: mairie.city || null,
            phone: mairie.phone ?? null,
            email: mairie.email ?? null,
          })
          .where(eq(addresses.id, existing[0].id));
        summary.updated++;
      }

      if (mairie.website) {
        const existingLink = await db
          .select({ id: externalLinks.id, url: externalLinks.url })
          .from(externalLinks)
          .where(
            and(
              eq(externalLinks.officialId, officialId),
              eq(externalLinks.platform, 'official_page'),
            ),
          )
          .limit(1);

        if (existingLink.length === 0) {
          await db.insert(externalLinks).values({
            officialId,
            platform: 'official_page',
            url: mairie.website,
            status: 'published',
            source: 'official',
            capturedAt: new Date().toISOString().slice(0, 10),
          });
          summary.websites++;
        } else if (existingLink[0].url !== mairie.website) {
          await db
            .update(externalLinks)
            .set({
              url: mairie.website,
              capturedAt: new Date().toISOString().slice(0, 10),
            })
            .where(eq(externalLinks.id, existingLink[0].id));
          summary.websites++;
        }
      }
    }
  }

  logger.info(
    `Mayor addresses: ${summary.created} created, ${summary.updated} updated, ${summary.websites} websites, ${summary.skipped} skipped`,
  );
  return summary;
}
