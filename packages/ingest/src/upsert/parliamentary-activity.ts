import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, parliamentaryActivity } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { DeputeActivity } from '../sources/an-activite.js';

export async function upsertParliamentaryActivity(
  db: NeonHttpDatabase,
  deputeActivities: DeputeActivity[],
) {
  const summary = { created: 0, updated: 0 };

  for (const depute of deputeActivities) {
    const [official] = await db
      .select()
      .from(officials)
      .where(eq(officials.anId, depute.id_an))
      .limit(1);

    if (!official) continue;

    for (const item of depute.activities) {
      const existing = await db
        .select()
        .from(parliamentaryActivity)
        .where(
          and(
            eq(parliamentaryActivity.officialId, official.id),
            eq(parliamentaryActivity.type, item.type),
            eq(parliamentaryActivity.title, item.title),
            eq(parliamentaryActivity.date, item.date),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(parliamentaryActivity).values({
          officialId: official.id,
          type: item.type,
          title: item.title,
          date: item.date,
          status: item.status ?? null,
        });
        summary.created++;
      } else {
        await db
          .update(parliamentaryActivity)
          .set({ status: item.status ?? null })
          .where(eq(parliamentaryActivity.id, existing[0].id));
        summary.updated++;
      }
    }
  }

  return summary;
}
