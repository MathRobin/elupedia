import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { RneMaire } from '../sources/rne-maires.js';
import { logger } from '../logger.js';
import {
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} from '../utils/checkpoint.js';

const BATCH_SIZE = 200;
const CHECKPOINT_NAME = 'upsert-mayors';

function slugify(firstName: string, lastName: string): string {
  return `${firstName}-${lastName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function sortKey(m: RneMaire): string {
  return `${m.communeCode}|${m.lastName}|${m.firstName}`;
}

export async function upsertMayors(db: NeonHttpDatabase, maires: RneMaire[]) {
  const summary = { officials: 0, mandates: 0, ended: 0, skipped: 0 };

  const sorted = [...maires].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b)),
  );

  const checkpoint = loadCheckpoint(CHECKPOINT_NAME);
  let startIndex = 0;
  if (checkpoint) {
    startIndex = sorted.findIndex((m) => sortKey(m) > checkpoint);
    if (startIndex === -1) startIndex = sorted.length;
    logger.info(
      `  Checkpoint found — resuming after "${checkpoint}" (skipping ${startIndex}/${sorted.length})`,
    );
  }

  const allOfficials = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      birthDate: officials.birthDate,
      slug: officials.slug,
    })
    .from(officials);

  const officialByKey = new Map<string, { id: string; slug: string | null }>();
  for (const o of allOfficials) {
    const key = `${o.firstName.toLowerCase()}|${o.lastName.toLowerCase()}|${o.birthDate ?? ''}`;
    officialByKey.set(key, { id: o.id, slug: o.slug });
  }

  const slugSet = new Set(
    allOfficials.filter((o) => o.slug).map((o) => o.slug!),
  );

  function uniqueSlug(base: string): string {
    if (!slugSet.has(base)) {
      slugSet.add(base);
      return base;
    }
    let i = 1;
    while (slugSet.has(`${base}-${i}`)) i++;
    const s = `${base}-${i}`;
    slugSet.add(s);
    return s;
  }

  const activeMandatesByCommune = new Map<
    string,
    { id: string; officialId: string }
  >();
  const activeMandates = await db
    .select({
      id: mandates.id,
      officialId: mandates.officialId,
      communeCode: mandates.communeCode,
    })
    .from(mandates)
    .where(and(eq(mandates.type, 'maire'), isNull(mandates.endDate)));

  for (const m of activeMandates) {
    if (m.communeCode) {
      activeMandatesByCommune.set(m.communeCode, {
        id: m.id,
        officialId: m.officialId,
      });
    }
  }

  const rneCommuneCodes = new Set(sorted.map((m) => m.communeCode));
  const today = new Date().toISOString().split('T')[0];

  // Close mandates for communes no longer in RNE (mayor left, commune merged, etc.)
  for (const [communeCode, mandate] of activeMandatesByCommune) {
    if (!rneCommuneCodes.has(communeCode)) {
      await db
        .update(mandates)
        .set({ endDate: today, updatedAt: new Date() })
        .where(eq(mandates.id, mandate.id));
      summary.ended++;
    }
  }

  const totalBatches = Math.ceil((sorted.length - startIndex) / BATCH_SIZE);

  for (let start = startIndex; start < sorted.length; start += BATCH_SIZE) {
    const batch = sorted.slice(start, start + BATCH_SIZE);
    const batchNum = Math.floor((start - startIndex) / BATCH_SIZE) + 1;
    logger.info(
      `  Processing batch ${batchNum}/${totalBatches} (${batch.length} maires)`,
    );

    for (const maire of batch) {
      const key = `${maire.firstName.toLowerCase()}|${maire.lastName.toLowerCase()}|${maire.birthDate}`;
      let official = officialByKey.get(key);

      if (!official) {
        const slug = uniqueSlug(slugify(maire.firstName, maire.lastName));
        const [inserted] = await db
          .insert(officials)
          .values({
            firstName: maire.firstName,
            lastName: maire.lastName,
            birthDate: maire.birthDate,
            slug,
          })
          .returning({ id: officials.id });
        official = { id: inserted!.id, slug };
        officialByKey.set(key, official);
        summary.officials++;
      }

      const previous = activeMandatesByCommune.get(maire.communeCode);

      if (previous && previous.officialId !== official.id) {
        await db
          .update(mandates)
          .set({
            endDate: maire.mandateStartDate || maire.functionStartDate || today,
            updatedAt: new Date(),
          })
          .where(eq(mandates.id, previous.id));
        summary.ended++;
        activeMandatesByCommune.delete(maire.communeCode);
      }

      const existingMandate = await db
        .select({ id: mandates.id })
        .from(mandates)
        .where(
          and(
            eq(mandates.officialId, official.id),
            eq(mandates.type, 'maire'),
            eq(mandates.communeCode, maire.communeCode),
          ),
        )
        .limit(1);

      if (existingMandate.length === 0) {
        const [inserted] = await db
          .insert(mandates)
          .values({
            officialId: official.id,
            type: 'maire',
            district: maire.communeName,
            department: maire.departmentName,
            startDate: maire.mandateStartDate || maire.functionStartDate,
            communeCode: maire.communeCode,
          })
          .returning({ id: mandates.id });
        activeMandatesByCommune.set(maire.communeCode, {
          id: inserted!.id,
          officialId: official.id,
        });
        summary.mandates++;
      } else {
        await db
          .update(mandates)
          .set({
            district: maire.communeName,
            department: maire.departmentName,
            startDate: maire.mandateStartDate || maire.functionStartDate,
            endDate: null,
            updatedAt: new Date(),
          })
          .where(eq(mandates.id, existingMandate[0].id));
        summary.mandates++;
      }
    }

    saveCheckpoint(CHECKPOINT_NAME, sortKey(batch[batch.length - 1]));
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  clearCheckpoint(CHECKPOINT_NAME);

  logger.info(
    `Mayors: ${summary.officials} officials created, ${summary.mandates} mandates upserted, ${summary.ended} mandates ended`,
  );
  return summary;
}
