/**
 * Upsert des décorations (Légion d'honneur, Ordre national du Mérite,
 * Médaille militaire) issues de la base Léonore (`sources/legion-honneur.ts`).
 * Appelé par `main-decorations.ts`, qui fournit aussi l'index de
 * rattachement `officialIndex`.
 *
 * Table écrite : `decorations`, index unique (arko_ref, order_name) — une
 * fiche Léonore (arkoRef) peut porter plusieurs ordres.
 * Idempotent : ON CONFLICT DO UPDATE réécrit tous les champs, `official_id`
 * compris (le rattachement est donc recalculé à chaque run et peut
 * redevenir NULL). Les fiches non rattachées sont conservées : l'identité
 * civile (nom, naissance, décès, lieu) reste exploitable sans official.
 * Rattachement : nom de famille + date de naissance identiques, et prénom
 * de l'élu en préfixe de celui de la fiche (voir `findOfficialId`). Sans
 * date de naissance publique sur la fiche, pas de rattachement : un nom
 * seul rattache des homonymes (`decoration-match.ts`). La fonction
 * `normalize` ci-dessous doit rester alignée avec celle de
 * `main-decorations.ts` qui construit l'index.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { decorations } from '@elupedia/shared';
import type { DecorationRecord } from '../sources/legion-honneur.js';
import { logger } from '../logger.js';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

export interface OfficialCandidate {
  id: string;
  firstName: string;
}

/** Clé de l'index de rattachement : nom de famille normalisé + date de naissance ISO. */
export function officialIndexKey(lastName: string, birthDate: string): string {
  return `${normalize(lastName)}|${birthDate}`;
}

/**
 * Fiche `officials` d'une décoration : même nom de famille et même date de
 * naissance, et un seul candidat dont le premier prénom est un préfixe de
 * celui de la fiche (qui porte souvent tous les prénoms d'état civil).
 * Retourne null sans date de naissance, sans candidat, ou en cas d'ambiguïté.
 */
export function findOfficialId(
  index: Map<string, OfficialCandidate[]>,
  record: Pick<DecorationRecord, 'lastName' | 'firstName' | 'birthDate'>,
): string | null {
  if (!record.birthDate) return null;
  const candidates = index.get(
    officialIndexKey(record.lastName, record.birthDate),
  );
  if (!candidates) return null;
  const first = normalize(record.firstName ?? '');
  const matching = candidates.filter((c) => {
    const own = normalize(c.firstName).split(' ')[0];
    return !own || !first ? !own && !first : first.startsWith(own);
  });
  return matching.length === 1 ? matching[0].id : null;
}

/**
 * Upsert en base de chaque décoration de chaque fiche (écriture DB, une
 * requête par décoration). `officialIndex` : voir `officialIndexKey`.
 * Retourne le nombre de fiches, de décorations et de fiches
 * rattachées à un official.
 */
export async function upsertDecorations(
  db: NeonHttpDatabase,
  records: DecorationRecord[],
  officialIndex: Map<string, OfficialCandidate[]>,
) {
  const summary = { records: 0, decorations: 0, matched: 0 };

  for (const record of records) {
    const officialId = findOfficialId(officialIndex, record);
    if (officialId) summary.matched++;

    for (const decoration of record.decorations) {
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
          orderName: decoration.orderName,
          grade: decoration.grade,
          decreeDate: decoration.decreeDate,
          journalOfficielDate: decoration.journalOfficielDate,
          ministry: decoration.ministry,
          quality: decoration.quality,
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
            grade: decoration.grade,
            decreeDate: decoration.decreeDate,
            journalOfficielDate: decoration.journalOfficielDate,
            ministry: decoration.ministry,
            quality: decoration.quality,
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
