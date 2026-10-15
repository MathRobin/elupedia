/**
 * Upsert des décorations (Légion d'honneur, Ordre national du Mérite,
 * Médaille militaire) issues de la base Léonore (`sources/legion-honneur.ts`).
 * Appelé par `main-decorations.ts`, qui fournit aussi la table de
 * rattachement `officialByName`.
 *
 * Table écrite : `decorations`, index unique (arko_ref, order_name) — une
 * fiche Léonore (arkoRef) peut porter plusieurs ordres.
 * Idempotent : ON CONFLICT DO UPDATE réécrit tous les champs, `official_id`
 * compris (le rattachement est donc recalculé à chaque run et peut
 * redevenir NULL). Les fiches non rattachées sont conservées : l'identité
 * civile (nom, naissance, décès, lieu) reste exploitable sans official.
 * Rattachement : clé `nom|prénom` normalisée (sans accents, tirets et
 * espaces multiples repliés) — la fonction `normalize` ci-dessous doit
 * rester alignée avec celle de `main-decorations.ts` qui construit la Map.
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

/**
 * Upsert en base de chaque décoration de chaque fiche (écriture DB, une
 * requête par décoration). `officialByName` : clé `nom|prénom` normalisée ->
 * official id. Retourne le nombre de fiches, de décorations et de fiches
 * rattachées à un official.
 */
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
