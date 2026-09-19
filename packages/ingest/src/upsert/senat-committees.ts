import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, committees } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { SenateurCommittees } from '../sources/senat-commissions.js';
import { logger } from '../logger.js';

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function upsertSenatCommittees(
  db: NeonHttpDatabase,
  senateurCommittees: SenateurCommittees[],
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

  const allCommittees = await db.select().from(committees);
  const existingByKey = new Map<string, typeof committees.$inferSelect>();
  for (const c of allCommittees) {
    existingByKey.set(`${c.officialId}|${c.name}|${c.type}|${c.startDate}`, c);
  }

  const newRows: (typeof committees.$inferInsert)[] = [];

  for (const senateur of senateurCommittees) {
    const officialId = officialByMatricule.get(senateur.matricule.trim());
    if (!officialId) {
      summary.skipped += senateur.committees.length;
      continue;
    }

    for (const item of senateur.committees) {
      const key = `${officialId}|${item.name}|${item.type}|${item.start_date}`;
      const existing = existingByKey.get(key);

      if (!existing) {
        newRows.push({
          officialId,
          name: item.name,
          type: item.type,
          startDate: item.start_date,
          endDate: item.end_date ?? null,
        });
        summary.created++;
      } else if (existing.endDate !== (item.end_date ?? null)) {
        await db
          .update(committees)
          .set({ endDate: item.end_date ?? null, updatedAt: new Date() })
          .where(eq(committees.id, existing.id));
        summary.updated++;
      }
    }
  }

  for (const rowChunk of chunk(newRows, 500)) {
    await db.insert(committees).values(rowChunk);
  }

  logger.info(
    `Sénat committees: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`,
  );
  return summary;
}
