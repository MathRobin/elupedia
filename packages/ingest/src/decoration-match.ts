/**
 * Règles de rattachement d'une décoration (fiche Léonore / LUD) à une fiche
 * `officials`, fonctions pures partagées par `main-decorations.ts` (via
 * `upsert/decorations.ts`) et `main-reconcile-decorations.ts`.
 *
 * Pourquoi : un nom + prénom ne suffit pas (homonymes, dont des décorés nés
 * au XIXe siècle). Le rattachement n'est « vérifié » que si la date de
 * naissance publique de la fiche décorée est identique à celle de l'élu.
 * Beaucoup de fiches récentes n'ont pas de date de naissance publique : elles
 * restent non rattachées (« unverified ») sauf contradiction évidente
 * (« rejected »).
 *
 * Dates : chaînes ISO `YYYY-MM-DD`, comparées telles quelles.
 * Piège : une date de naissance d'élu erronée (RNE) fait rejeter un bon
 * rattachement ; le choix est volontairement prudent.
 */

export type DecorationMatch = 'verified' | 'rejected' | 'unverified';

export interface DecorationMatchInput {
  officialBirth: string | null;
  officialDeath: string | null;
  /** L'élu a un mandat en cours (donc n'est pas décédé). */
  officialActive: boolean;
  decorationBirth: string | null;
  decorationDeath: string | null;
  decreeDate: string | null;
}

/** Âge minimal supposé pour recevoir une décoration. */
const MIN_AGE_AT_DECREE = 16;

function addYears(iso: string, years: number): string {
  const y = Number(iso.slice(0, 4)) + years;
  return `${String(y).padStart(4, '0')}${iso.slice(4)}`;
}

export function classifyDecorationMatch(
  i: DecorationMatchInput,
): DecorationMatch {
  if (i.decorationBirth && i.officialBirth) {
    return i.decorationBirth === i.officialBirth ? 'verified' : 'rejected';
  }
  if (i.decorationBirth || !i.officialBirth) {
    // Une seule des deux dates est connue : rien ne permet de confirmer.
    return 'unverified';
  }
  // La fiche décorée n'a pas de date de naissance publique : on ne peut
  // que rejeter les rattachements impossibles.
  if (
    i.decreeDate &&
    i.decreeDate < addYears(i.officialBirth, MIN_AGE_AT_DECREE)
  ) {
    return 'rejected';
  }
  if (i.decorationDeath) {
    if (i.decorationDeath < i.officialBirth) return 'rejected';
    if (i.officialDeath && i.decorationDeath !== i.officialDeath) {
      return 'rejected';
    }
    if (!i.officialDeath && i.officialActive) return 'rejected';
  }
  return 'unverified';
}

/** Mots politiques dans la « qualité » d'une décoration : piste à examiner à la main, jamais un rattachement. */
export const POLITICAL_QUALITY =
  /(député|sénateur|maire|conseiller (général|régional|départemental|municipal)|parlementaire)/i;
