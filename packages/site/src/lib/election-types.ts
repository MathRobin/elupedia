/**
 * Types partagés par les pages `/elections` (`pages/elections/index.astro`,
 * `pages/elections/[type]/[id].astro`) et les composants React qu'elles
 * rendent (`ElectionsList`, `ElectionPanorama`). Les pages Astro font les
 * requêtes SQL et passent ces structures déjà aplaties aux composants, qui
 * n'accèdent jamais à la base.
 */

export type ElectionType = 'municipale' | 'legislative' | 'senatoriale';

/** Un candidat tel qu'affiché dans le panorama d'un scrutin. */
export type PanoramaCandidate = {
  nom: string;
  prenom: string;
  /** Nuance politique déclarée au ministère de l'Intérieur (ex. « LR », « DVG »). */
  nuance: string | null;
  /** Nom de la liste (scrutins de liste uniquement). */
  liste: string | null;
  sortant: boolean;
  /** `null` tant que les résultats ne sont pas connus. */
  elected: boolean | null;
  /** Commune ou département selon le type d'élection. */
  scope: string;
  /** Vrai si le candidat est rattaché à une fiche élu Elupedia. */
  hasProfile: boolean;
  profileSlug: string | null;
  profilePhotoUrl: string | null;
};

/** Un scrutin (type + date + tour) listé sur la page d'index des élections. */
export type ElectionEvent = {
  type: ElectionType;
  /** Slug utilisé dans l'URL `/elections/[type]/[id]`. */
  id: string;
  label: string;
  electionDate: string;
  round: number;
  candidateCount: number;
  /** Nombre de communes ou de départements concernés. */
  scopeCount: number;
};
