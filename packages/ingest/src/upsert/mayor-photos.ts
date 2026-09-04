import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { WikidataMayorPhoto } from '../sources/wikidata-mayor-photos.js';
import { logger } from '../logger.js';

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function dateOnly(d: string): string {
  return d.slice(0, 10);
}

function matchKey(
  firstName: string,
  lastName: string,
  birthDate: string,
): string {
  return `${normalize(firstName)}|${normalize(lastName)}|${dateOnly(birthDate)}`;
}

export async function upsertMayorPhotos(
  db: NeonHttpDatabase,
  photos: WikidataMayorPhoto[],
) {
  const summary = { matched: 0, updated: 0, skipped: 0 };

  const mayors = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      birthDate: officials.birthDate,
      photoUrl: officials.photoUrl,
    })
    .from(officials)
    .innerJoin(mandates, eq(mandates.officialId, officials.id))
    .where(and(eq(mandates.type, 'maire'), isNull(mandates.endDate)));

  const mayorByKey = new Map<string, { id: string; photoUrl: string | null }>();
  for (const m of mayors) {
    if (!m.birthDate) continue;
    const key = matchKey(m.firstName, m.lastName, m.birthDate);
    mayorByKey.set(key, { id: m.id, photoUrl: m.photoUrl });
  }

  logger.info(`  ${mayorByKey.size} mayors loaded for matching`);

  const photoByKey = new Map<string, string>();
  for (const p of photos) {
    const parts = p.name.split(' ');
    if (parts.length < 2) continue;

    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    photoByKey.set(matchKey(firstName, lastName, p.birthDate), p.imageUrl);

    if (parts.length > 2) {
      photoByKey.set(
        matchKey(
          parts.slice(0, 2).join(' '),
          parts.slice(2).join(' '),
          p.birthDate,
        ),
        p.imageUrl,
      );
    }
  }

  logger.info(`  ${photoByKey.size} Wikidata photo keys built`);

  const dbSample = [...mayorByKey.keys()].slice(0, 3);
  const wdSample = [...photoByKey.keys()].slice(0, 3);
  logger.info(`  DB key samples: ${dbSample.join(' | ')}`);
  logger.info(`  WD key samples: ${wdSample.join(' | ')}`);

  for (const [key, mayor] of mayorByKey) {
    const imageUrl = photoByKey.get(key);
    if (!imageUrl) continue;

    summary.matched++;

    if (mayor.photoUrl) {
      summary.skipped++;
      continue;
    }

    await db
      .update(officials)
      .set({ photoUrl: imageUrl, updatedAt: new Date() })
      .where(eq(officials.id, mayor.id));
    summary.updated++;
  }

  logger.info(
    `Mayor photos: ${summary.matched} matched, ${summary.updated} updated, ${summary.skipped} already had photo`,
  );
  return summary;
}
