/**
 * Ordre des groupes politiques de gauche à droite, tel qu'ils siègent dans
 * l'hémicycle (vu du perchoir : la gauche de l'assemblée est à gauche du
 * dessin). Sert à placer les blocs de groupe dans les représentations
 * d'hémicycle qui n'ont pas de numéro de siège (vidéos, Sénat). Les groupes
 * absents de la liste sont placés après les derniers connus, avant les
 * non-inscrits.
 */
export const POLITICAL_GROUP_ORDER: readonly string[] = [
  // Assemblée nationale (XVIIe législature)
  'Gauche Démocrate et Républicaine (GDR)',
  'La France insoumise - Nouveau Front Populaire (LFI-NFP)',
  'Écologiste et Social (EcoS)',
  'Socialistes et apparentés (SOC)',
  'Libertés, Indépendants, Outre-mer et Territoires (LIOT)',
  'Les Démocrates (Dem)',
  'Ensemble pour la République (EPR)',
  'Horizons & Indépendants (HOR)',
  'Droite Républicaine (DR)',
  'À Droite ! (AD)',
  'Rassemblement National (RN)',
  // Sénat
  'Communiste Républicain Citoyen et Écologiste - Kanaky (CRCE-K)',
  'Socialiste, Écologiste et Républicain (SER)',
  'Écologiste - Solidarité et Territoires (GEST)',
  'Rassemblement Démocratique et Social Européen (RDSE)',
  'Rassemblement des démocrates, progressistes et indépendants (RDPI)',
  'Union Centriste (UC)',
  'Les Indépendants - République et Territoires (LIRT)',
  'Les Républicains (LR)',
  'Rassemblement National et Apparentés (RN)',
];

const UNATTACHED = [
  'Non inscrits (NI)',
  'Réunion administrative des sénateurs ne figurant sur la liste d aucun groupe (RASNAG)',
];

/** Rang de placement : connu → son index, inconnu → après, non-inscrits → tout à la fin. */
export function politicalGroupRank(name: string): number {
  if (UNATTACHED.includes(name)) return POLITICAL_GROUP_ORDER.length + 1;
  const i = POLITICAL_GROUP_ORDER.indexOf(name);
  return i === -1 ? POLITICAL_GROUP_ORDER.length : i;
}
