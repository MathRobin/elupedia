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

export type PoliticalBloc = 'left' | 'centre' | 'right';

/**
 * Bloc d'un groupe selon son placement dans l'hémicycle, vu du perchoir :
 * côté gauche, centre, côté droit. C'est un fait de placement, pas un
 * jugement : il sert uniquement à dire « la gauche » ou « la droite » quand
 * tous les groupes d'un côté votent pareil. Les groupes du centre et les
 * non-inscrits n'appartiennent à aucun des deux blocs.
 */
const BLOCS: Record<string, PoliticalBloc> = {
  // Assemblée nationale
  'Gauche Démocrate et Républicaine (GDR)': 'left',
  'La France insoumise - Nouveau Front Populaire (LFI-NFP)': 'left',
  'Écologiste et Social (EcoS)': 'left',
  'Socialistes et apparentés (SOC)': 'left',
  'Libertés, Indépendants, Outre-mer et Territoires (LIOT)': 'centre',
  'Les Démocrates (Dem)': 'centre',
  'Ensemble pour la République (EPR)': 'centre',
  'Horizons & Indépendants (HOR)': 'centre',
  'Droite Républicaine (DR)': 'right',
  'À Droite ! (AD)': 'right',
  'Rassemblement National (RN)': 'right',
  // Sénat
  'Communiste Républicain Citoyen et Écologiste - Kanaky (CRCE-K)': 'left',
  'Socialiste, Écologiste et Républicain (SER)': 'left',
  'Écologiste - Solidarité et Territoires (GEST)': 'left',
  'Rassemblement Démocratique et Social Européen (RDSE)': 'centre',
  'Rassemblement des démocrates, progressistes et indépendants (RDPI)':
    'centre',
  'Union Centriste (UC)': 'centre',
  'Les Indépendants - République et Territoires (LIRT)': 'centre',
  'Les Républicains (LR)': 'right',
  'Rassemblement National et Apparentés (RN)': 'right',
};

export function politicalBloc(name: string): PoliticalBloc | null {
  return BLOCS[name] ?? null;
}
