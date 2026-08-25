import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { dataProvenance } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';

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
