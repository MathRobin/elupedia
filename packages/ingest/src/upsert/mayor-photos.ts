import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type {
  WikidataMayorPhoto,
  CommonsLicense,
} from '../sources/wikidata-mayor-photos.js';
import { fetchCommonsLicense } from '../sources/wikidata-mayor-photos.js';
import { logger } from '../logger.js';

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’']/g, "'")
    .replace(/-/g, ' ')
    .trim();
}

export function matchKey(
  firstName: string,
  lastName: string,
  communeCode: string,
): string {
  return `${normalize(firstName)}|${normalize(lastName)}|${communeCode}`;
}

export function matchKeyBirthDate(
  firstName: string,
  lastName: string,
  birthDate: string,
): string {
  return `${normalize(firstName)}|${normalize(lastName)}|${birthDate.slice(0, 10)}`;
}

export interface MayorPhotoReport {
  wikidataTotal: number;
  matchedByCommune: number;
  matchedByBirthDate: number;
  photosUpdated: number;
  alreadyHadPhoto: number;
  licenseFetched: number;
  unmatched: Array<{
    name: string;
    communeName: string;
    communeCode: string;
    qid: string;
  }>;
  conflicts: Array<{
    name: string;
    communeName: string;
    existingPhoto: string;
    wikidataPhoto: string;
  }>;
}

export async function upsertMayorPhotos(
  db: NeonHttpDatabase,
  photos: WikidataMayorPhoto[],
): Promise<{
  matched: number;
  updated: number;
  skipped: number;
  report: MayorPhotoReport;
}> {
  const summary = { matched: 0, updated: 0, skipped: 0 };
  const report: MayorPhotoReport = {
    wikidataTotal: photos.length,
    matchedByCommune: 0,
    matchedByBirthDate: 0,
    photosUpdated: 0,
    alreadyHadPhoto: 0,
    licenseFetched: 0,
    unmatched: [],
    conflicts: [],
  };

  const mayors = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      birthDate: officials.birthDate,
      photoUrl: officials.photoUrl,
      communeCode: mandates.communeCode,
    })
    .from(officials)
    .innerJoin(mandates, eq(mandates.officialId, officials.id))
    .where(and(eq(mandates.type, 'maire'), isNull(mandates.endDate)));

  const mayorByCommuneKey = new Map<
    string,
    { id: string; photoUrl: string | null; firstName: string; lastName: string }
  >();
  const mayorByBirthKey = new Map<
    string,
    { id: string; photoUrl: string | null; firstName: string; lastName: string }
  >();

  for (const m of mayors) {
    if (m.communeCode) {
      const key = matchKey(m.firstName, m.lastName, m.communeCode);
      mayorByCommuneKey.set(key, {
        id: m.id,
        photoUrl: m.photoUrl,
        firstName: m.firstName,
        lastName: m.lastName,
      });
    }
    if (m.birthDate) {
      const key = matchKeyBirthDate(m.firstName, m.lastName, m.birthDate);
      mayorByBirthKey.set(key, {
        id: m.id,
        photoUrl: m.photoUrl,
        firstName: m.firstName,
        lastName: m.lastName,
      });
    }
  }

  logger.info(
    `  ${mayorByCommuneKey.size} mayors by commune, ${mayorByBirthKey.size} by birth date`,
  );

  const processed = new Set<string>();

  for (const p of photos) {
    const parts = p.name.split(' ');
    if (parts.length < 2) {
      report.unmatched.push({
        name: p.name,
        communeName: p.communeName,
        communeCode: p.communeCode,
        qid: p.qid,
      });
      continue;
    }

    const nameCombinations: Array<[string, string]> = [];
    nameCombinations.push([parts[0], parts.slice(1).join(' ')]);
    if (parts.length > 2) {
      nameCombinations.push([
        parts.slice(0, 2).join(' '),
        parts.slice(2).join(' '),
      ]);
    }

    let mayor: {
      id: string;
      photoUrl: string | null;
      firstName: string;
      lastName: string;
    } | null = null;
    let matchType: 'commune' | 'birthdate' = 'commune';

    for (const [fn, ln] of nameCombinations) {
      const communeKey = matchKey(fn, ln, p.communeCode);
      const found = mayorByCommuneKey.get(communeKey);
      if (found) {
        mayor = found;
        matchType = 'commune';
        break;
      }
    }

    if (!mayor) {
      for (const [fn, ln] of nameCombinations) {
        const birthKey = matchKeyBirthDate(fn, ln, p.birthDate);
        const found = mayorByBirthKey.get(birthKey);
        if (found) {
          mayor = found;
          matchType = 'birthdate';
          break;
        }
      }
    }

    if (!mayor) {
      report.unmatched.push({
        name: p.name,
        communeName: p.communeName,
        communeCode: p.communeCode,
        qid: p.qid,
      });
      continue;
    }

    if (processed.has(mayor.id)) continue;
    processed.add(mayor.id);

    summary.matched++;
    if (matchType === 'commune') report.matchedByCommune++;
    else report.matchedByBirthDate++;

    if (mayor.photoUrl) {
      summary.skipped++;
      report.alreadyHadPhoto++;
      report.conflicts.push({
        name: p.name,
        communeName: p.communeName,
        existingPhoto: mayor.photoUrl,
        wikidataPhoto: p.imageUrl,
      });
      continue;
    }

    let license: CommonsLicense | null = null;
    try {
      license = await fetchCommonsLicense(p.imageUrl);
      if (license) report.licenseFetched++;
    } catch {
      logger.warn(`  License fetch failed for ${p.name}`);
    }

    const thumbUrl = `${p.imageUrl}?width=400`;

    await db
      .update(officials)
      .set({ photoUrl: thumbUrl, updatedAt: new Date() })
      .where(eq(officials.id, mayor.id));

    summary.updated++;
    report.photosUpdated++;

    logger.info(
      `  + ${p.name} (${p.communeName}): photo set${license ? ` [${license.name}]` : ''}`,
    );

    await new Promise((r) => setTimeout(r, 300));
  }

  report.wikidataTotal = photos.length;

  logger.info(
    `\nMayor photos report:` +
      `\n  Wikidata total: ${report.wikidataTotal}` +
      `\n  Matched by commune: ${report.matchedByCommune}` +
      `\n  Matched by birth date: ${report.matchedByBirthDate}` +
      `\n  Photos updated: ${report.photosUpdated}` +
      `\n  Already had photo (conflicts): ${report.alreadyHadPhoto}` +
      `\n  Licenses fetched: ${report.licenseFetched}` +
      `\n  Unmatched: ${report.unmatched.length}`,
  );

  if (report.unmatched.length > 0) {
    logger.info('\nUnmatched mayors (first 20):');
    for (const u of report.unmatched.slice(0, 20)) {
      logger.info(
        `  - ${u.name} — ${u.communeName} (${u.communeCode}) [${u.qid}]`,
      );
    }
  }

  if (report.conflicts.length > 0) {
    logger.info(
      `\nConflicts (existing photo, not overwritten): ${report.conflicts.length}`,
    );
    for (const c of report.conflicts.slice(0, 10)) {
      logger.info(`  - ${c.name} (${c.communeName})`);
    }
  }

  return { ...summary, report };
}
