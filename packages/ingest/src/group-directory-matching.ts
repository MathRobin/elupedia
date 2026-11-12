/**
 * Rapprochement d'une entrée d'annuaire de groupe parlementaire (ticket
 * #276) avec une fiche `officials`. Les annuaires ne portent aucun
 * identifiant AN : on rapproche sur le nom et l'appartenance au groupe.
 *
 * Règles, dans l'ordre :
 * 1. fiche du même groupe dont le nom complet (prénom + nom, sans
 *    particules, sans accents, indépendamment de l'ordre et de la casse)
 *    est identique → `exact`. Deux fiches identiques → `unresolved`
 *    (homonymes, on ne tranche pas) ;
 * 2. sinon, fiche du même groupe dont le nom de famille est contenu dans le
 *    nom de l'entrée (couvre les noms composés et les noms d'usage) → `probable`,
 *    seulement si cette fiche est unique ;
 * 3. sinon → `unresolved`. Ne jamais aller au-delà de `probable`.
 *
 * Le groupe courant d'une fiche vient de `affiliations` (kind 'group',
 * end_date null). Son libellé est « Nom (SIGLE) » ; le sigle est comparé au
 * `groupCode` de la config (ex. « Droite Républicaine (DR) » → DR).
 *
 * Fonctions pures sauf `loadGroupOfficialIndex`, qui lit la base (lecture
 * seule). Testé sans base dans group-directory-matching.test.ts.
 */
import { and, eq, isNull } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { affiliations, officials, normalizePersonName } from '@elupedia/shared';

export type MatchConfidence = 'exact' | 'probable' | 'unresolved';

export interface MatchResult {
  officialId: string | null;
  confidence: MatchConfidence;
  /** Raison lisible, utile au journal et au script de debug. */
  reason: string;
}

export interface GroupOfficial {
  id: string;
  firstName: string;
  lastName: string;
}

/** Index des fiches par sigle de groupe, en minuscules (clé = groupCode). */
export type GroupOfficialIndex = Map<string, GroupOfficial[]>;

/** Particules retirées des noms avant comparaison (« de », « d' », « van »…). */
const PARTICLES = new Set([
  'de',
  'du',
  'des',
  'd',
  'la',
  'le',
  'les',
  'van',
  'von',
  'den',
  'der',
]);

/** Civilités en tête de nom dans les annuaires (« M. », « Mme », « Mlle »). */
const CIVILITY = /^(m|mme|mlle)\.?(\s+|$)/i;

/** Tokens normalisés d'un nom, particules retirées. */
export function nameTokens(raw: string): string[] {
  const withoutCivility = raw.trim().replace(CIVILITY, '');
  return normalizePersonName(withoutCivility)
    .split(' ')
    .filter((token) => token !== '' && !PARTICLES.has(token));
}

/** Clé d'égalité : mêmes tokens, quel que soit l'ordre. */
function sortedKey(tokens: string[]): string {
  return [...tokens].sort().join(' ');
}

/** Sigle entre parenthèses de fin de libellé : « Droite Républicaine (DR) » → « dr ». */
export function groupCodeFromLabel(label: string): string | null {
  const match = /\(([^()]+)\)\s*$/.exec(label.trim());
  return match ? match[1].trim().toLowerCase() : null;
}

/**
 * Construit l'index à partir de lignes « fiche + libellé de groupe actif ».
 * Une fiche n'apparaît qu'une fois par groupe, même si plusieurs lignes d'affiliation existent.
 */
export function buildGroupOfficialIndex(
  rows: {
    id: string;
    firstName: string;
    lastName: string;
    partyOrGroup: string;
  }[],
): GroupOfficialIndex {
  const index: GroupOfficialIndex = new Map();
  for (const row of rows) {
    const code = groupCodeFromLabel(row.partyOrGroup);
    if (!code) continue;
    const members = index.get(code) ?? [];
    if (!members.some((member) => member.id === row.id)) {
      members.push({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
      });
    }
    index.set(code, members);
  }
  return index;
}

/** Lit la base (lecture seule) : fiches avec un groupe parlementaire actif. */
export async function loadGroupOfficialIndex(
  db: NeonHttpDatabase,
): Promise<GroupOfficialIndex> {
  const rows = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      partyOrGroup: affiliations.partyOrGroup,
    })
    .from(affiliations)
    .innerJoin(officials, eq(affiliations.officialId, officials.id))
    .where(and(eq(affiliations.kind, 'group'), isNull(affiliations.endDate)));
  return buildGroupOfficialIndex(rows);
}

/**
 * Rapproche une entrée (nom tel qu'affiché dans l'annuaire, sigle du groupe)
 * avec une fiche. Fonction pure.
 */
export function matchOfficial(
  entry: { name: string; groupCode: string },
  index: GroupOfficialIndex,
): MatchResult {
  const members = index.get(entry.groupCode.toLowerCase()) ?? [];
  if (members.length === 0) {
    return {
      officialId: null,
      confidence: 'unresolved',
      reason: `aucune fiche active dans le groupe ${entry.groupCode}`,
    };
  }

  const entryTokens = nameTokens(entry.name);
  if (entryTokens.length === 0) {
    return { officialId: null, confidence: 'unresolved', reason: 'nom vide' };
  }

  // 1. Nom complet identique (ordre et casse indifférents).
  const entryKey = sortedKey(entryTokens);
  const exact = members.filter(
    (member) =>
      sortedKey([
        ...nameTokens(member.firstName),
        ...nameTokens(member.lastName),
      ]) === entryKey,
  );
  if (exact.length === 1) {
    return {
      officialId: exact[0].id,
      confidence: 'exact',
      reason: 'nom complet identique dans le groupe',
    };
  }
  if (exact.length > 1) {
    return {
      officialId: null,
      confidence: 'unresolved',
      reason: `homonymes dans le groupe (${exact.length} fiches)`,
    };
  }

  // 2. Nom de famille présent dans le nom de l'entrée, fiche unique.
  const entrySet = new Set(entryTokens);
  const bySurname = members.filter((member) => {
    const surnameTokens = nameTokens(member.lastName);
    return (
      surnameTokens.length > 0 &&
      surnameTokens.every((token) => entrySet.has(token))
    );
  });
  if (bySurname.length === 1) {
    return {
      officialId: bySurname[0].id,
      confidence: 'probable',
      reason: 'nom de famille unique dans le groupe',
    };
  }
  if (bySurname.length > 1) {
    return {
      officialId: null,
      confidence: 'unresolved',
      reason: `nom de famille commun à ${bySurname.length} fiches du groupe`,
    };
  }

  // 3. Rien à quoi se raccrocher.
  return {
    officialId: null,
    confidence: 'unresolved',
    reason: 'aucune fiche du groupe ne correspond',
  };
}
