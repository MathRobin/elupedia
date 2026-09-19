import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, committees } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { DeputeCommittees } from '../sources/an-commissions.js';

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function upsertCommittees(
  db: NeonHttpDatabase,
  deputeCommittees: DeputeCommittees[],
) {
  const summary = { created: 0, updated: 0 };

  const allOfficials = await db
    .select({ id: officials.id, anId: officials.anId })
    .from(officials);
  const officialByAnId = new Map<string, string>();
  for (const o of allOfficials) {
    if (o.anId) officialByAnId.set(o.anId, o.id);
  }

  const allCommittees = await db.select().from(committees);
  const existingByKey = new Map<string, typeof committees.$inferSelect>();
  for (const c of allCommittees) {
    existingByKey.set(`${c.officialId}|${c.name}|${c.type}|${c.startDate}`, c);
  }

  const newRows: (typeof committees.$inferInsert)[] = [];

  for (const depute of deputeCommittees) {
    const officialId = officialByAnId.get(depute.id_an);
    if (!officialId) continue;

    for (const item of depute.committees) {
      const key = `${officialId}|${item.name}|${item.type}|${item.start_date}`;
      const existing = existingByKey.get(key);

      if (!existing) {
        newRows.push({
          officialId,
          name: item.name,
          type: item.type,
          anUid: item.an_uid ?? null,
          startDate: item.start_date,
          endDate: item.end_date ?? null,
        });
        summary.created++;
      } else if (
        existing.endDate !== (item.end_date ?? null) ||
        (item.an_uid && existing.anUid !== item.an_uid)
      ) {
        await db
          .update(committees)
          .set({
            endDate: item.end_date ?? null,
            anUid: item.an_uid ?? existing.anUid,
            updatedAt: new Date(),
          })
          .where(eq(committees.id, existing.id));
        summary.updated++;
      }
    }
  }

  for (const rowChunk of chunk(newRows, 500)) {
    await db.insert(committees).values(rowChunk);
  }

  return summary;
}
