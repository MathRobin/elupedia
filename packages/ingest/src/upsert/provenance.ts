import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { dataProvenance } from '@elupedia/shared';
import { eq, and, inArray } from 'drizzle-orm';

const PROVENANCE_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function writeProvenance(
  db: NeonHttpDatabase,
  opts: {
    sourceTable: string;
    sourceRecordId: string;
    sourceName: string;
    sourceUrl: string;
    legalBasis: string;
    rawData: unknown;
  },
): Promise<void> {
  const existing = await db
    .select({ id: dataProvenance.id })
    .from(dataProvenance)
    .where(
      and(
        eq(dataProvenance.sourceTable, opts.sourceTable),
        eq(dataProvenance.sourceRecordId, opts.sourceRecordId),
      ),
    )
    .limit(1);

  const now = new Date();

  if (existing.length === 0) {
    await db.insert(dataProvenance).values({
      sourceTable: opts.sourceTable,
      sourceRecordId: opts.sourceRecordId,
      sourceName: opts.sourceName,
      sourceUrl: opts.sourceUrl,
      legalBasis: opts.legalBasis,
      rawData: (opts.rawData ?? null) as Record<string, unknown> | null,
      fetchedAt: now,
    });
  } else {
    await db
      .update(dataProvenance)
      .set({
        rawData: (opts.rawData ?? null) as Record<string, unknown> | null,
        fetchedAt: now,
      })
      .where(eq(dataProvenance.id, existing[0].id));
  }
}

/**
 * Same semantics as writeProvenance, but for many rows of the same
 * sourceTable at once: one SELECT + one bulk INSERT per chunk instead of
 * a SELECT + INSERT/UPDATE per row. Existing rows are only updated when
 * rawData actually changed, since re-fetching the same source data is the
 * common case on repeat ingestion runs.
 */
export async function writeProvenanceBatch(
  db: NeonHttpDatabase,
  items: {
    sourceTable: string;
    sourceRecordId: string;
    sourceName: string;
    sourceUrl: string;
    legalBasis: string;
    rawData: unknown;
  }[],
): Promise<void> {
  for (const batch of chunk(items, PROVENANCE_CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    const sourceTable = batch[0].sourceTable;
    const recordIds = batch.map((i) => i.sourceRecordId);

    const existing = await db
      .select({
        id: dataProvenance.id,
        sourceRecordId: dataProvenance.sourceRecordId,
        rawData: dataProvenance.rawData,
      })
      .from(dataProvenance)
      .where(
        and(
          eq(dataProvenance.sourceTable, sourceTable),
          inArray(dataProvenance.sourceRecordId, recordIds),
        ),
      );

    const existingByRecordId = new Map(
      existing.map((e) => [e.sourceRecordId, e]),
    );
    const now = new Date();
    const newRows: (typeof dataProvenance.$inferInsert)[] = [];

    for (const item of batch) {
      const found = existingByRecordId.get(item.sourceRecordId);
      const rawData = (item.rawData ?? null) as Record<string, unknown> | null;

      if (!found) {
        newRows.push({
          sourceTable: item.sourceTable,
          sourceRecordId: item.sourceRecordId,
          sourceName: item.sourceName,
          sourceUrl: item.sourceUrl,
          legalBasis: item.legalBasis,
          rawData,
          fetchedAt: now,
        });
      } else if (JSON.stringify(found.rawData) !== JSON.stringify(rawData)) {
        await db
          .update(dataProvenance)
          .set({ rawData, fetchedAt: now })
          .where(eq(dataProvenance.id, found.id));
      }
    }

    if (newRows.length > 0) {
      await db.insert(dataProvenance).values(newRows);
    }
  }
}
