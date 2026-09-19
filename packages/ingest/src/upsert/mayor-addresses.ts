import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { mandates, addresses, externalLinks } from '@elupedia/shared';
import { eq, and, inArray } from 'drizzle-orm';
import type { MairieData } from '../sources/dila-mairies.js';
import { logger } from '../logger.js';
import {
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} from '../utils/checkpoint.js';

const BATCH_SIZE = 200;
const CHECKPOINT_NAME = 'upsert-mayor-addresses';

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

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

    const batchOfficialIds: string[] = [];
    for (const mairie of batch) {
      const officialId = officialByCommune.get(mairie.communeCode);
      if (!officialId) {
        summary.skipped++;
        continue;
      }
      batchOfficialIds.push(officialId);
    }

    const existingAddresses = batchOfficialIds.length
      ? await db
          .select()
          .from(addresses)
          .where(
            and(
              inArray(addresses.officialId, batchOfficialIds),
              eq(addresses.type, 'town_hall'),
            ),
          )
      : [];
    const addressByOfficialId = new Map(
      existingAddresses.map((a) => [a.officialId, a]),
    );

    const existingLinks = batchOfficialIds.length
      ? await db
          .select()
          .from(externalLinks)
          .where(
            and(
              inArray(externalLinks.officialId, batchOfficialIds),
              eq(externalLinks.platform, 'official_page'),
            ),
          )
      : [];
    const linkByOfficialId = new Map(
      existingLinks.map((l) => [l.officialId, l]),
    );

    const newAddressRows: (typeof addresses.$inferInsert)[] = [];
    const newLinkRows: (typeof externalLinks.$inferInsert)[] = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const mairie of batch) {
      const officialId = officialByCommune.get(mairie.communeCode);
      if (!officialId) continue;

      const existingAddress = addressByOfficialId.get(officialId);

      if (!existingAddress) {
        newAddressRows.push({
          officialId,
          type: 'town_hall',
          street: mairie.street || null,
          postalCode: mairie.postalCode || null,
          city: mairie.city || null,
          phone: mairie.phone ?? null,
          email: mairie.email ?? null,
        });
        summary.created++;
      } else if (
        existingAddress.street !== (mairie.street || null) ||
        existingAddress.postalCode !== (mairie.postalCode || null) ||
        existingAddress.city !== (mairie.city || null) ||
        existingAddress.phone !== (mairie.phone ?? null) ||
        existingAddress.email !== (mairie.email ?? null)
      ) {
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
          .where(eq(addresses.id, existingAddress.id));
        summary.updated++;
      }

      if (mairie.website) {
        const existingLink = linkByOfficialId.get(officialId);

        if (!existingLink) {
          newLinkRows.push({
            officialId,
            platform: 'official_page',
            url: mairie.website,
            status: 'published',
            source: 'official',
            capturedAt: today,
          });
          summary.websites++;
        } else if (existingLink.url !== mairie.website) {
          await db
            .update(externalLinks)
            .set({
              url: mairie.website,
              capturedAt: today,
              updatedAt: new Date(),
            })
            .where(eq(externalLinks.id, existingLink.id));
          summary.websites++;
        }
      }
    }

    for (const rowChunk of chunk(newAddressRows, 500)) {
      await db.insert(addresses).values(rowChunk);
    }
    for (const rowChunk of chunk(newLinkRows, 500)) {
      await db.insert(externalLinks).values(rowChunk);
    }

    saveCheckpoint(CHECKPOINT_NAME, batch[batch.length - 1].communeCode);
  }

  clearCheckpoint(CHECKPOINT_NAME);

  logger.info(
    `Mayor addresses: ${summary.created} created, ${summary.updated} updated, ${summary.websites} websites, ${summary.skipped} skipped`,
  );
  return summary;
}
