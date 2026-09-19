import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, parliamentaryActivity } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { DeputeActivity } from '../sources/an-activite.js';

const INSERT_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function upsertParliamentaryActivity(
  db: NeonHttpDatabase,
  deputeActivities: DeputeActivity[],
) {
  const summary = { created: 0, updated: 0 };

  const allOfficials = await db
    .select({ id: officials.id, anId: officials.anId })
    .from(officials);
  const officialByAnId = new Map<string, string>();
  for (const o of allOfficials) {
    if (o.anId) officialByAnId.set(o.anId, o.id);
  }

  for (const depute of deputeActivities) {
    const officialId = officialByAnId.get(depute.id_an);
    if (!officialId) continue;

    const existingActivities = await db
      .select()
      .from(parliamentaryActivity)
      .where(eq(parliamentaryActivity.officialId, officialId));

    const existingByKey = new Map(
      existingActivities.map((a) => [`${a.type}|${a.title}|${a.date}`, a]),
    );

    const newRows: (typeof parliamentaryActivity.$inferInsert)[] = [];

    for (const item of depute.activities) {
      const key = `${item.type}|${item.title}|${item.date}`;
      const existing = existingByKey.get(key);

      if (!existing) {
        newRows.push({
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
      } else if (
        existing.status !== (item.status ?? null) ||
        existing.questionText !== (item.questionText ?? null) ||
        existing.responseText !== (item.responseText ?? null) ||
        existing.responseDate !== (item.responseDate ?? null) ||
        existing.governmentComments !== (item.ministry ?? null) ||
        existing.sourceUrl !== (item.sourceUrl ?? null) ||
        existing.rubrique !== (item.rubrique ?? null) ||
        existing.teteAnalyse !== (item.teteAnalyse ?? null) ||
        existing.questionNumber !== (item.questionNumber ?? null)
      ) {
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
          .where(eq(parliamentaryActivity.id, existing.id));
        summary.updated++;
      }
    }

    for (const rowChunk of chunk(newRows, INSERT_CHUNK_SIZE)) {
      await db.insert(parliamentaryActivity).values(rowChunk);
      summary.created += rowChunk.length;
    }
  }

  return summary;
}
