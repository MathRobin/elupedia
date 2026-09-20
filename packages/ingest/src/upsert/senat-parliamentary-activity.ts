import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, parliamentaryActivity } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { SenateurActivity } from '../sources/senat-activite.js';
import { logger } from '../logger.js';

const INSERT_CHUNK_SIZE = 500;
const LOG_CHUNK_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

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

  logger.info(`  ${senateurActivities.length} sénateurs to process`);

  for (let i = 0; i < senateurActivities.length; i++) {
    const senateur = senateurActivities[i];

    if (i % LOG_CHUNK_SIZE === 0) {
      logger.info(
        `  [${i + 1}/${senateurActivities.length}] sénat parliamentary activity...`,
      );
    }

    const officialId = officialByMatricule.get(senateur.matricule.trim());
    if (!officialId) {
      summary.skipped += senateur.activities.length;
      continue;
    }

    try {
      const existingActivities = await db
        .select()
        .from(parliamentaryActivity)
        .where(eq(parliamentaryActivity.officialId, officialId));

      const existingByKey = new Map(
        existingActivities.map((a) => [`${a.type}|${a.title}|${a.date}`, a]),
      );

      const newRows: (typeof parliamentaryActivity.$inferInsert)[] = [];

      for (const item of senateur.activities) {
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
    } catch (error) {
      logger.error(
        `  Failed processing activity for sénateur ${senateur.matricule}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  logger.info(
    `Sénat parliamentary activity: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped (no matching official)`,
  );
  return summary;
}
