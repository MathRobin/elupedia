/**
 * Couleur d'affichage (hex) de chaque groupe parlementaire, indexée par le
 * libellé exact stocké dans `mandates.political_group`.
 *
 * Les clés reprennent la forme « Nom complet (SIGLE) » telle qu'écrite par
 * les ingestions AN et Sénat : la correspondance est stricte (pas de
 * normalisation), un groupe renommé à la source perd donc sa couleur tant
 * que l'entrée n'est pas ajoutée ici. Le site (`elus/[slug]`) rabat sur
 * `null` pour un groupe inconnu. Les couleurs AN et Sénat d'une même famille
 * politique sont volontairement identiques.
 */
export const POLITICAL_GROUP_COLORS: Record<string, string> = {
  // Assemblée nationale
  'La France insoumise - Nouveau Front Populaire (LFI-NFP)': '#CC2443',
  'Gauche Démocrate et Républicaine (GDR)': '#C9462C',
  'Écologiste et Social (EcoS)': '#00A550',
  'Socialistes et apparentés (SOC)': '#FF8080',
  'Ensemble pour la République (EPR)': '#7B5EAE',
  'Les Démocrates (Dem)': '#FF9900',
  'Horizons & Indépendants (HOR)': '#00BFFF',
  'Libertés, Indépendants, Outre-mer et Territoires (LIOT)': '#D4A017',
  'Droite Républicaine (DR)': '#0066CC',
  'À Droite ! (AD)': '#354B80',
  'Rassemblement National (RN)': '#0D378A',
  'Non inscrits (NI)': '#AAAAAA',

  // Sénat
  'Communiste Républicain Citoyen et Écologiste - Kanaky (CRCE-K)': '#DD0000',
  'Socialiste, Écologiste et Républicain (SER)': '#FF8080',
  'Écologiste - Solidarité et Territoires (GEST)': '#00A550',
  'Rassemblement des démocrates, progressistes et indépendants (RDPI)':
    '#7B5EAE',
  'Union Centriste (UC)': '#00BFFF',
  'Les Indépendants - République et Territoires (LIRT)': '#D4A017',
  'Les Républicains (LR)': '#0066CC',
  'Rassemblement National et Apparentés (RN)': '#0D378A',
  // Libellé source avec « d aucun » sans apostrophe : conservé tel quel
  // pour matcher la valeur ingérée.
  'Réunion administrative des sénateurs ne figurant sur la liste d aucun groupe (RASNAG)':
    '#AAAAAA',
};
