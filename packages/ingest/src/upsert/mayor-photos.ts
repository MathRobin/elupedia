/**
 * Pose une photo (Wikimedia Commons) sur les fiches de maires qui n'en ont
 * pas, à partir des maires en poste déclarés sur Wikidata
 * (`sources/wikidata-mayor-photos.ts`). Appelé par `run-maires.ts`
 * (étape 3).
 *
 * Table écrite : `officials`, colonne `photo_url` uniquement (URL Commons
 * avec paramètre de miniature `?width=`).
 * Rattachement : Wikidata ne donne qu'un libellé « Prénom Nom » ; on essaie
 * deux découpes (1er mot / reste, puis 2 premiers mots / reste) contre les
 * maires actifs en base, d'abord par (prénom, nom, code INSEE de la
 * commune), puis par (prénom, nom, date de naissance). Noms normalisés
 * sans accents ni tirets.
 * Jamais écrasé : une fiche qui a déjà une photo (quelle qu'en soit la
 * source) n'est pas modifiée — le cas est listé dans `report.conflicts`
 * pour arbitrage manuel. Un maire apparaissant plusieurs fois côté Wikidata
 * n'est traité qu'une fois. La licence Commons est récupérée (appel
 * réseau) pour le log uniquement, elle n'est pas stockée.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type {
  WikidataMayorPhoto,
  CommonsLicense,
} from '../sources/wikidata-mayor-photos.js';
import { fetchCommonsLicense } from '../sources/wikidata-mayor-photos.js';
import { logger } from '../logger.js';

// Largeur de la miniature demandée à Commons.
const THUMBNAIL_WIDTH = 400;
// Pause entre deux appels à l'API Commons (licence).
const COMMONS_REQUEST_DELAY_MS = 300;
// Nombre d'entrées non rattachées / en conflit détaillées dans le log.
const UNMATCHED_LOG_LIMIT = 20;
const CONFLICTS_LOG_LIMIT = 10;

/** Normalise un prénom ou nom pour comparaison : sans accents, minuscules, apostrophes unifiées, tirets -> espaces. */
export function normalizeMayorName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’']/g, "'")
    .replace(/-/g, ' ')
    .trim();
}

/** Clé de rattachement par commune : prénom|nom normalisés + code INSEE. */
export function communeMatchKey(
  firstName: string,
  lastName: string,
  communeCode: string,
): string {
  return `${normalizeMayorName(firstName)}|${normalizeMayorName(lastName)}|${communeCode}`;
}

/** Clé de rattachement par naissance : prénom|nom normalisés + date ISO (jour). */
export function matchKeyBirthDate(
  firstName: string,
  lastName: string,
  birthDate: string,
): string {
  return `${normalizeMayorName(firstName)}|${normalizeMayorName(lastName)}|${birthDate.slice(0, 10)}`;
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

interface MayorCandidate {
  id: string;
  photoUrl: string | null;
  firstName: string;
  lastName: string;
}

/**
 * Rattache chaque photo Wikidata à un maire actif et pose `photo_url` sur
 * les fiches sans photo (appels réseau Commons + écriture DB). Retourne les
 * compteurs matched / updated / skipped et un rapport détaillé.
 */
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

  const mayorByCommuneKey = new Map<string, MayorCandidate>();
  const mayorByBirthKey = new Map<string, MayorCandidate>();

  for (const mayor of mayors) {
    const candidate: MayorCandidate = {
      id: mayor.id,
      photoUrl: mayor.photoUrl,
      firstName: mayor.firstName,
      lastName: mayor.lastName,
    };
    if (mayor.communeCode) {
      mayorByCommuneKey.set(
        communeMatchKey(mayor.firstName, mayor.lastName, mayor.communeCode),
        candidate,
      );
    }
    if (mayor.birthDate) {
      mayorByBirthKey.set(
        matchKeyBirthDate(mayor.firstName, mayor.lastName, mayor.birthDate),
        candidate,
      );
    }
  }

  logger.info(
    `  ${mayorByCommuneKey.size} mayors by commune, ${mayorByBirthKey.size} by birth date`,
  );

  const processed = new Set<string>();

  for (const photo of photos) {
    const nameParts = photo.name.split(' ');
    if (nameParts.length < 2) {
      report.unmatched.push({
        name: photo.name,
        communeName: photo.communeName,
        communeCode: photo.communeCode,
        qid: photo.qid,
      });
      continue;
    }

    // Découpes [prénom, nom] candidates : "Jean Dupont" -> ["Jean", "Dupont"] ;
    // "Jean Pierre Dupont" -> ["Jean", "Pierre Dupont"] puis
    // ["Jean Pierre", "Dupont"] (prénoms composés).
    const nameCombinations: Array<[string, string]> = [];
    nameCombinations.push([nameParts[0], nameParts.slice(1).join(' ')]);
    if (nameParts.length > 2) {
      nameCombinations.push([
        nameParts.slice(0, 2).join(' '),
        nameParts.slice(2).join(' '),
      ]);
    }

    let mayor: MayorCandidate | null = null;
    let matchType: 'commune' | 'birthdate' = 'commune';

    for (const [firstName, lastName] of nameCombinations) {
      const communeKey = communeMatchKey(
        firstName,
        lastName,
        photo.communeCode,
      );
      const found = mayorByCommuneKey.get(communeKey);
      if (found) {
        mayor = found;
        matchType = 'commune';
        break;
      }
    }

    if (!mayor) {
      for (const [firstName, lastName] of nameCombinations) {
        const birthKey = matchKeyBirthDate(
          firstName,
          lastName,
          photo.birthDate,
        );
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
        name: photo.name,
        communeName: photo.communeName,
        communeCode: photo.communeCode,
        qid: photo.qid,
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
        name: photo.name,
        communeName: photo.communeName,
        existingPhoto: mayor.photoUrl,
        wikidataPhoto: photo.imageUrl,
      });
      continue;
    }

    let license: CommonsLicense | null = null;
    try {
      license = await fetchCommonsLicense(photo.imageUrl);
      if (license) report.licenseFetched++;
    } catch {
      logger.warn(`  License fetch failed for ${photo.name}`);
    }

    const thumbUrl = `${photo.imageUrl}?width=${THUMBNAIL_WIDTH}`;

    await db
      .update(officials)
      .set({ photoUrl: thumbUrl, updatedAt: new Date() })
      .where(eq(officials.id, mayor.id));

    summary.updated++;
    report.photosUpdated++;

    logger.info(
      `  + ${photo.name} (${photo.communeName}): photo set${license ? ` [${license.name}]` : ''}`,
    );

    await new Promise((resolve) =>
      setTimeout(resolve, COMMONS_REQUEST_DELAY_MS),
    );
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
    logger.info(`\nUnmatched mayors (first ${UNMATCHED_LOG_LIMIT}):`);
    for (const unmatched of report.unmatched.slice(0, UNMATCHED_LOG_LIMIT)) {
      logger.info(
        `  - ${unmatched.name} — ${unmatched.communeName} (${unmatched.communeCode}) [${unmatched.qid}]`,
      );
    }
  }

  if (report.conflicts.length > 0) {
    logger.info(
      `\nConflicts (existing photo, not overwritten): ${report.conflicts.length}`,
    );
    for (const conflict of report.conflicts.slice(0, CONFLICTS_LOG_LIMIT)) {
      logger.info(`  - ${conflict.name} (${conflict.communeName})`);
    }
  }

  return { ...summary, report };
}
