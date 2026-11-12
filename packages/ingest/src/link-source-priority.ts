/**
 * Priorité des sources de liens externes (ticket #278). Quand deux sources
 * proposent une URL différente pour la même plateforme d'un élu, la source
 * la plus prioritaire gagne ; la valeur perdante n'est pas écrite.
 *
 * Ordre, du plus au moins prioritaire :
 * - `official` : open data et pages officielles de l'AN et du Sénat (100) ;
 * - `scraped_personal_website` : site personnel déclaré par l'élu (80) ;
 * - `group_directory` : annuaire de groupe parlementaire (60) ;
 * - toute autre source (Wikipédia, MaDada, valeur inconnue) : 10.
 *
 * Priorité numérique portée par la source, pas une cascade de `if` : ajouter
 * une source revient à ajouter une entrée dans `LINK_SOURCE_PRIORITY`.
 *
 * Fonctions pures, testées dans link-source-priority.test.ts.
 */
export const LINK_SOURCE_PRIORITY: Readonly<Record<string, number>> = {
  official: 100,
  scraped_personal_website: 80,
  group_directory: 60,
};

/** Priorité des sources non listées (« autres »). */
export const OTHER_LINK_SOURCE_PRIORITY = 10;

export function linkSourcePriority(source: string): number {
  return LINK_SOURCE_PRIORITY[source] ?? OTHER_LINK_SOURCE_PRIORITY;
}

/** Issue d'un conflit entre le lien existant (même plateforme, autre URL) et le candidat. */
export type ConflictOutcome = 'candidate_wins' | 'existing_wins' | 'tie';

export function compareLinkSources(
  existingSource: string,
  candidateSource: string,
): ConflictOutcome {
  const existing = linkSourcePriority(existingSource);
  const candidate = linkSourcePriority(candidateSource);
  if (candidate > existing) return 'candidate_wins';
  if (candidate < existing) return 'existing_wins';
  return 'tie';
}
