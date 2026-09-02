import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, parliamentaryActivity } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { SenateurActivity } from '../sources/senat-activite.js';
import { logger } from '../logger.js';

export async function upsertSenatParliamentaryActivity(
  db: NeonHttpDatabase,
  senateurActivities: SenateurActivity[],
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

  for (const senateur of senateurActivities) {
    const officialId = officialByMatricule.get(senateur.matricule.trim());
    if (!officialId) {
      summary.skipped += senateur.activities.length;
      continue;
    }

    for (const item of senateur.activities) {
      const existing = await db
        .select({ id: parliamentaryActivity.id })
        .from(parliamentaryActivity)
        .where(
          and(
            eq(parliamentaryActivity.officialId, officialId),
            eq(parliamentaryActivity.type, item.type),
            eq(parliamentaryActivity.title, item.title),
            eq(parliamentaryActivity.date, item.date),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(parliamentaryActivity).values({
          officialId,
          type: item.type,
          title: item.title,
          date: item.date,
          status: item.status ?? null,
          questionText: item.questionText ?? null,
          responseText: item.responseText ?? null,
          responseDate: item.responseDate ?? null,
          governmentComments: item.ministry ?? null,
          sourceUrl: item.sourceUrl ?? null,
          rubrique: item.rubrique ?? null,
          teteAnalyse: item.teteAnalyse ?? null,
          questionNumber: item.questionNumber ?? null,
        });
        summary.created++;
      } else {
        await db
          .update(parliamentaryActivity)
          .set({
            status: item.status ?? null,
            questionText: item.questionText ?? null,
            responseText: item.responseText ?? null,
            responseDate: item.responseDate ?? null,
            governmentComments: item.ministry ?? null,
            sourceUrl: item.sourceUrl ?? null,
            rubrique: item.rubrique ?? null,
            teteAnalyse: item.teteAnalyse ?? null,
            questionNumber: item.questionNumber ?? null,
            updatedAt: new Date(),
          })
          .where(eq(parliamentaryActivity.id, existing[0].id));
        summary.updated++;
      }
    }
  }

  logger.info(
    `Sénat parliamentary activity: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped (no matching official)`,
  );
  return summary;
}
