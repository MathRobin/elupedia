import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, committees } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { DeputeCommittees } from '../sources/an-commissions.js';

export async function upsertCommittees(
  db: NeonHttpDatabase,
  deputeCommittees: DeputeCommittees[],
) {
  const summary = { created: 0, updated: 0 };

  for (const depute of deputeCommittees) {
    const [official] = await db
      .select()
      .from(officials)
      .where(eq(officials.anId, depute.id_an))
      .limit(1);

    if (!official) continue;

    for (const item of depute.committees) {
      const existing = await db
        .select()
        .from(committees)
        .where(
          and(
            eq(committees.officialId, official.id),
            eq(committees.name, item.name),
            eq(committees.type, item.type),
            eq(committees.startDate, item.start_date),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(committees).values({
          officialId: official.id,
          name: item.name,
          type: item.type,
          startDate: item.start_date,
          endDate: item.end_date ?? null,
        });
        summary.created++;
      } else {
        await db
          .update(committees)
          .set({ endDate: item.end_date ?? null })
          .where(eq(committees.id, existing[0].id));
        summary.updated++;
      }
    }
  }

  return summary;
}
