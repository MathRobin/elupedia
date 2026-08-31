import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, committees } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { SenateurCommittees } from '../sources/senat-commissions.js';
import { logger } from '../logger.js';

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

  for (const senateur of senateurCommittees) {
    const officialId = officialByMatricule.get(senateur.matricule.trim());
    if (!officialId) {
      summary.skipped += senateur.committees.length;
      continue;
    }

    for (const item of senateur.committees) {
      const existing = await db
        .select({ id: committees.id })
        .from(committees)
        .where(
          and(
            eq(committees.officialId, officialId),
            eq(committees.name, item.name),
            eq(committees.type, item.type),
            eq(committees.startDate, item.start_date),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(committees).values({
          officialId,
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

  logger.info(
    `Sénat committees: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`,
  );
  return summary;
}
