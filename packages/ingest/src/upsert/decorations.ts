import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { decorations } from '@elupedia/shared';
import type { DecorationRecord } from '../sources/legion-honneur.js';
import { logger } from '../logger.js';

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

export async function upsertDecorations(
  db: NeonHttpDatabase,
  records: DecorationRecord[],
  officialByName: Map<string, string>,
) {
  const summary = { records: 0, decorations: 0, matched: 0 };

  for (const record of records) {
    const officialKey = `${normalize(record.lastName)}|${normalize(record.firstName ?? '')}`;
    const officialId = officialByName.get(officialKey) ?? null;
    if (officialId) summary.matched++;

    for (const d of record.decorations) {
      await db
        .insert(decorations)
        .values({
          officialId,
          lastName: record.lastName,
          firstName: record.firstName,
          sex: record.sex,
          birthDate: record.birthDate,
          deathDate: record.deathDate,
          birthPlace: record.birthPlace,
          orderName: d.orderName,
          grade: d.grade,
          decreeDate: d.decreeDate,
          journalOfficielDate: d.journalOfficielDate,
          ministry: d.ministry,
          quality: d.quality,
          arkoRef: record.arkoRef,
        })
        .onConflictDoUpdate({
          target: [decorations.arkoRef, decorations.orderName],
          set: {
            officialId,
            lastName: record.lastName,
            firstName: record.firstName,
            sex: record.sex,
            birthDate: record.birthDate,
            deathDate: record.deathDate,
            birthPlace: record.birthPlace,
            grade: d.grade,
            decreeDate: d.decreeDate,
            journalOfficielDate: d.journalOfficielDate,
            ministry: d.ministry,
            quality: d.quality,
            updatedAt: new Date(),
          },
        });

      summary.decorations++;
    }

    summary.records++;
  }

  logger.info(
    `Decorations: ${summary.records} records, ${summary.decorations} decorations, ${summary.matched} matched to officials`,
  );
  return summary;
}
