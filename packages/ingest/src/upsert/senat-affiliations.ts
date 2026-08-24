import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, affiliations } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { SenatAffiliation } from '../sources/senat-groupes.js';
import { logger } from '../logger.js';

export async function upsertSenatAffiliations(
  db: NeonHttpDatabase,
  items: SenatAffiliation[],
) {
  const summary = { created: 0, updated: 0 };
  const cache = new Map<string, string>();

  for (const item of items) {
    let officialId = cache.get(item.matricule);
    if (!officialId) {
      const matches = await db
        .select({ id: officials.id })
        .from(officials)
        .where(eq(officials.senatId, item.matricule))
        .limit(1);
      if (matches.length === 0) continue;
      officialId = matches[0].id;
      cache.set(item.matricule, officialId);
    }

    if (!item.start_date) continue;

    const existing = await db
      .select()
      .from(affiliations)
      .where(
        and(
          eq(affiliations.officialId, officialId),
          eq(affiliations.partyOrGroup, item.group_name),
          eq(affiliations.startDate, item.start_date),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(affiliations).values({
        officialId,
        partyOrGroup: item.group_name,
        startDate: item.start_date,
        endDate: item.end_date,
      });
      summary.created++;
    } else {
      await db
        .update(affiliations)
        .set({ endDate: item.end_date })
        .where(eq(affiliations.id, existing[0].id));
      summary.updated++;
    }
  }

  logger.info(
    `Senate affiliations: ${summary.created} created, ${summary.updated} updated`,
  );
  return summary;
}
