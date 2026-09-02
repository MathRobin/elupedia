import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { mandates, addresses, externalLinks } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { MairieData } from '../sources/dila-mairies.js';
import { logger } from '../logger.js';
import {
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} from '../utils/checkpoint.js';

const BATCH_SIZE = 200;
const CHECKPOINT_NAME = 'upsert-mayor-addresses';

export async function upsertMayorAddresses(
  db: NeonHttpDatabase,
  mairies: MairieData[],
) {
  const summary = { created: 0, updated: 0, websites: 0, skipped: 0 };

  const sorted = [...mairies].sort((a, b) =>
    a.communeCode.localeCompare(b.communeCode),
  );

  const checkpoint = loadCheckpoint(CHECKPOINT_NAME);
  let startIndex = 0;
  if (checkpoint) {
    startIndex = sorted.findIndex((m) => m.communeCode > checkpoint);
    if (startIndex === -1) startIndex = sorted.length;
    logger.info(
      `  Checkpoint found — resuming after "${checkpoint}" (skipping ${startIndex}/${sorted.length})`,
    );
  }

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

  const totalBatches = Math.ceil((sorted.length - startIndex) / BATCH_SIZE);

  for (let start = startIndex; start < sorted.length; start += BATCH_SIZE) {
    const batch = sorted.slice(start, start + BATCH_SIZE);
    const batchNum = Math.floor((start - startIndex) / BATCH_SIZE) + 1;
    logger.info(
      `  Processing batch ${batchNum}/${totalBatches} (${batch.length} mairies)`,
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
            updatedAt: new Date(),
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
              updatedAt: new Date(),
            })
            .where(eq(externalLinks.id, existingLink[0].id));
          summary.websites++;
        }
      }
    }

    saveCheckpoint(CHECKPOINT_NAME, batch[batch.length - 1].communeCode);
  }

  clearCheckpoint(CHECKPOINT_NAME);

  logger.info(
    `Mayor addresses: ${summary.created} created, ${summary.updated} updated, ${summary.websites} websites, ${summary.skipped} skipped`,
  );
  return summary;
}
