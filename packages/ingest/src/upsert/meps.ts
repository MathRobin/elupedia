/**
 * Upsert des eurodéputés français à partir de l'API open data du Parlement
 * européen (`sources/parlement-europeen.ts`), appelé par le script
 * `ingest:europe` (`run-europe.ts`).
 *
 * Tables écrites : `officials`, `mandates` (type `eurodepute`), `affiliations`
 * (groupe européen + parti national) et `data_provenance`.
 *
 * Clés de rapprochement :
 * - official : `europarl_id`, sinon nom normalisé + date de naissance exacte
 *   parmi les officials sans `europarl_id` (cf. `upsertMep`) ;
 * - mandat : official + type + date de début ;
 * - affiliation : official + kind + affiliation active (`end_date IS NULL`).
 *
 * Idempotent. Jamais écrasés : une `photo_url` déjà connue (la photo AN /
 * Sénat prime sur celle du PE), une date de naissance connue quand l'API n'en
 * fournit pas, et le nom/prénom d'un official déjà rattaché.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates, affiliations } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { FrenchMep, MepDetail } from '../sources/parlement-europeen.js';
import { CURRENT_LEGISLATURE } from '../sources/parlement-europeen.js';
import { writeProvenance } from './provenance.js';
import { logger } from '../logger.js';

const SOURCE_NAME = 'Parlement européen - Open Data API';
const LEGAL_BASIS = 'Licence CC BY 4.0 - data.europarl.europa.eu';

/** Photo officielle : URL stable, pas d'authentification requise. */
function mepPhotoUrl(europarlId: string): string {
  return `https://www.europarl.europa.eu/mepphoto/${europarlId}.jpg`;
}

function slugify(firstName: string, lastName: string): string {
  return `${firstName}-${lastName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Ajoute un suffixe `-1`, `-2`... si le slug de base est déjà pris (homonyme
 * non rattaché, ex. deux "Philippe Olivier" nés à des dates différentes).
 * Une requête par candidat : acceptable vu le faible volume (81 eurodéputés).
 */
async function uniqueSlug(db: NeonHttpDatabase, base: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  for (;;) {
    const existing = await db
      .select({ id: officials.id })
      .from(officials)
      .where(eq(officials.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
    candidate = `${base}-${suffix}`;
    suffix++;
  }
}

/** Normalise un nom pour le matching : minuscules, sans accents, espaces/tirets uniformisés. Ne suffit jamais seul (homonymes) — toujours combiné à la date de naissance. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

export interface MepUpsertInput {
  mep: FrenchMep;
  detail: MepDetail;
  /** Libellé du parti national déjà résolu par l'appelant (null si inconnu). */
  nationalPartyLabel: string | null;
}

export interface MepUpsertResult {
  officialId: string;
  /** true si un nouvel official a été inséré, false s'il a été rattaché. */
  created: boolean;
}

/**
 * Rattache un eurodéputé à un `official` existant (député/sénateur ayant aussi
 * un mandat européen) via nom normalisé + date de naissance exacte, ou en crée
 * un nouveau. Le nom seul ne suffit pas (homonymes, particules, changements de
 * nom) : la date de naissance est obligatoire pour un rattachement — sans elle
 * (bday absent côté API), un nouvel `official` est créé plutôt que de risquer
 * un mauvais rattachement. Taux d'erreur mesuré sur l'échantillon des 81
 * eurodéputés français actuels : voir commentaire du ticket M24T3.
 *
 * Écrit ensuite le mandat `eurodepute` en cours, les affiliations (groupe
 * européen, parti national) et la provenance. Lève en cas d'erreur DB :
 * c'est `upsertMeps` qui isole les échecs par eurodéputé.
 */
export async function upsertMep(
  db: NeonHttpDatabase,
  input: MepUpsertInput,
): Promise<MepUpsertResult> {
  const { mep, detail, nationalPartyLabel } = input;

  const existingByEuroparlId = await db
    .select({
      id: officials.id,
      birthDate: officials.birthDate,
      photoUrl: officials.photoUrl,
    })
    .from(officials)
    .where(eq(officials.europarlId, mep.id))
    .limit(1);

  let officialId: string;
  let created = false;

  if (existingByEuroparlId.length > 0) {
    officialId = existingByEuroparlId[0].id;
    await db
      .update(officials)
      .set({
        birthDate: detail.birthDate ?? existingByEuroparlId[0].birthDate,
        photoUrl: existingByEuroparlId[0].photoUrl ?? mepPhotoUrl(mep.id),
        updatedAt: new Date(),
      })
      .where(eq(officials.id, officialId));
  } else {
    const candidates = detail.birthDate
      ? await db
          .select({
            id: officials.id,
            firstName: officials.firstName,
            lastName: officials.lastName,
            photoUrl: officials.photoUrl,
          })
          .from(officials)
          .where(
            and(
              eq(officials.birthDate, detail.birthDate),
              isNull(officials.europarlId),
            ),
          )
      : [];

    const match = candidates.find(
      (candidate) =>
        normalizeName(candidate.lastName) === normalizeName(mep.familyName) &&
        normalizeName(candidate.firstName) === normalizeName(mep.givenName),
    );

    if (match) {
      officialId = match.id;
      await db
        .update(officials)
        .set({
          europarlId: mep.id,
          photoUrl: match.photoUrl ?? mepPhotoUrl(mep.id),
          updatedAt: new Date(),
        })
        .where(eq(officials.id, officialId));
    } else {
      const slug = await uniqueSlug(db, slugify(mep.givenName, mep.familyName));
      const [inserted] = await db
        .insert(officials)
        .values({
          firstName: mep.givenName,
          lastName: mep.familyName,
          europarlId: mep.id,
          birthDate: detail.birthDate,
          photoUrl: mepPhotoUrl(mep.id),
          slug,
        })
        .returning();
      officialId = inserted!.id;
      created = true;
    }
  }

  if (detail.currentParliamentaryMandate) {
    const { startDate, endDate } = detail.currentParliamentaryMandate;
    const existingMandate = await db
      .select({ id: mandates.id })
      .from(mandates)
      .where(
        and(
          eq(mandates.officialId, officialId),
          eq(mandates.type, 'eurodepute'),
          eq(mandates.startDate, startDate),
        ),
      )
      .limit(1);

    if (existingMandate.length === 0) {
      await db.insert(mandates).values({
        officialId,
        type: 'eurodepute',
        startDate,
        endDate,
        politicalGroup: mep.politicalGroup,
        legislature: CURRENT_LEGISLATURE,
      });
    } else {
      await db
        .update(mandates)
        .set({
          endDate,
          politicalGroup: mep.politicalGroup,
          legislature: CURRENT_LEGISLATURE,
          updatedAt: new Date(),
        })
        .where(eq(mandates.id, existingMandate[0].id));
    }
  }

  if (mep.politicalGroup) {
    await upsertAffiliation(db, {
      officialId,
      kind: 'european_group',
      partyOrGroup: mep.politicalGroup,
      // L'API ne date pas l'adhésion au groupe : on prend le début du mandat
      // en cours, à défaut la date du jour.
      startDate:
        detail.currentParliamentaryMandate?.startDate ??
        new Date().toISOString().split('T')[0],
    });
  }

  if (nationalPartyLabel && detail.currentNationalPartyStartDate) {
    await upsertAffiliation(db, {
      officialId,
      kind: 'national_party',
      partyOrGroup: nationalPartyLabel,
      startDate: detail.currentNationalPartyStartDate,
    });
  }

  await writeProvenance(db, {
    sourceTable: 'officials',
    sourceRecordId: `europarl:${mep.id}`,
    sourceName: SOURCE_NAME,
    sourceUrl: `https://www.europarl.europa.eu/meps/fr/${mep.id}`,
    legalBasis: LEGAL_BASIS,
    rawData: { mep, detail, nationalPartyLabel },
  });

  return { officialId, created };
}

/**
 * Historise l'affiliation d'un official pour un `kind` donné : si l'affiliation
 * active est déjà la bonne, ne fait rien ; sinon clôt les affiliations actives
 * de ce kind à la date du jour et en ouvre une nouvelle. Les deux kinds
 * (groupe européen, parti national) sont indépendants et ne s'écrasent pas.
 */
async function upsertAffiliation(
  db: NeonHttpDatabase,
  opts: {
    officialId: string;
    kind: 'european_group' | 'national_party';
    partyOrGroup: string;
    startDate: string;
  },
): Promise<void> {
  const activeAffiliations = await db
    .select({ id: affiliations.id, partyOrGroup: affiliations.partyOrGroup })
    .from(affiliations)
    .where(
      and(
        eq(affiliations.officialId, opts.officialId),
        eq(affiliations.kind, opts.kind),
        isNull(affiliations.endDate),
      ),
    );

  const alreadyCurrent = activeAffiliations.find(
    (affiliation) => affiliation.partyOrGroup === opts.partyOrGroup,
  );
  if (alreadyCurrent) return;

  const today = new Date().toISOString().split('T')[0];
  for (const affiliation of activeAffiliations) {
    await db
      .update(affiliations)
      .set({ endDate: today, updatedAt: new Date() })
      .where(eq(affiliations.id, affiliation.id));
  }

  await db.insert(affiliations).values({
    officialId: opts.officialId,
    kind: opts.kind,
    partyOrGroup: opts.partyOrGroup,
    startDate: opts.startDate,
  });
}

export interface MepUpsertSummary {
  created: number;
  linked: number;
  errors: number;
}

/**
 * Upsert de tous les eurodéputés, un par un : une erreur sur l'un est loguée
 * et comptée dans `errors` sans interrompre le lot.
 */
export async function upsertMeps(
  db: NeonHttpDatabase,
  inputs: MepUpsertInput[],
): Promise<MepUpsertSummary> {
  const summary: MepUpsertSummary = { created: 0, linked: 0, errors: 0 };

  for (const input of inputs) {
    try {
      const result = await upsertMep(db, input);
      if (result.created) summary.created++;
      else summary.linked++;
    } catch (error) {
      logger.error(
        `MEP ${input.mep.id} (${input.mep.givenName} ${input.mep.familyName}): ${error}`,
      );
      summary.errors++;
    }
  }

  return summary;
}
