/**
 * Libellés français des types de mandat (`mandates.type`).
 *
 * `mandates.type` est un varchar libre (pas d'enum Postgres) : les valeurs
 * sont celles écrites par les upserts de l'ingest (AN, Sénat, Parlement
 * européen, fichiers RNE). Ce mapping est la seule source des libellés
 * affichés par le site (fiche élu, embed, oEmbed, image OG) et sert aussi
 * à valider le flag `--type` de `ingest:press:maires`.
 *
 * Piège : `president` n'est produit par aucune ingestion ; il n'existe ici
 * que pour être exclu explicitement par `main-press-maires.ts`.
 *
 * Le fichier porte aussi l'ordre de priorité entre mandats cumulés
 * (pickPrimaryMandate) et une description courte des mandats peu connus
 * (MANDATE_TYPE_DESCRIPTIONS, affichée en infobulle).
 */
export const MANDATE_TYPE_LABELS: Record<string, string> = {
  premier_ministre: 'Premier ministre',
  ministre: 'Ministre',
  secretaire_etat: "Secrétaire d'État",
  depute: 'Député',
  senateur: 'Sénateur',
  maire: 'Maire',
  eurodepute: 'Député·e européen·ne',
  conseiller_departemental: 'Conseiller départemental',
  conseiller_communautaire: 'Conseiller communautaire',
  conseiller_regional: 'Conseiller régional',
  conseiller_arrondissement: "Conseiller d'arrondissement",
  membre_assemblee_statut_particulier: "Membre d'assemblée territoriale",
  conseiller_francais_etranger: "Conseiller des Français de l'étranger",
  membre_afe: "Membre de l'Assemblée des Français de l'étranger",
  president: 'Président',
};

/**
 * Libellé d'un type de mandat ; renvoie le type brut s'il est inconnu, pour
 * qu'une valeur imprévue en base reste visible plutôt que masquée.
 */
export function mandateTypeLabel(type: string): string {
  return MANDATE_TYPE_LABELS[type] ?? type;
}

/**
 * Explication en une phrase des mandats dont l'intitulé ne parle pas de
 * lui-même, pour une infobulle. Les mandats nationaux évidents n'en ont pas.
 */
export const MANDATE_TYPE_DESCRIPTIONS: Record<string, string> = {
  premier_ministre:
    "Chef du Gouvernement, nommé par le président de la République ; le portefeuille et les dates viennent de l'open data de l'Assemblée nationale.",
  ministre:
    "Membre du Gouvernement (ministre, ministre d'État, ministre délégué) ; l'intitulé du portefeuille est celui publié par l'Assemblée nationale.",
  secretaire_etat:
    "Membre du Gouvernement placé auprès d'un ministre ; l'intitulé est celui publié par l'Assemblée nationale.",
  conseiller_communautaire:
    "Élu siégeant au conseil de l'intercommunalité (métropole, communauté urbaine, d'agglomération ou de communes) dont dépend sa commune ; désigné lors des élections municipales.",
  conseiller_arrondissement:
    "Élu d'un conseil d'arrondissement de Paris, Lyon ou Marseille, instance de proximité de la commune.",
  membre_assemblee_statut_particulier:
    "Membre d'une assemblée de collectivité à statut particulier (Corse, Guyane, Martinique, Métropole de Lyon, collectivités d'outre-mer).",
  conseiller_francais_etranger:
    "Élu d'un conseil consulaire, représentant les Français établis dans une circonscription à l'étranger.",
  membre_afe:
    "Membre de l'Assemblée des Français de l'étranger, élu par les conseillers des Français de l'étranger.",
};

/**
 * Types de mandat issus de l'open data AN pour les membres du Gouvernement
 * (mandats `MINISTERE`). Pas de circonscription ni de groupe : `district`
 * porte l'intitulé du portefeuille, `department` et `political_group` sont
 * vides.
 */
export const GOVERNMENT_MANDATE_TYPES: ReadonlySet<string> = new Set([
  'premier_ministre',
  'ministre',
  'secretaire_etat',
]);

/**
 * Ordre dans lequel un mandat est retenu comme « principal » quand un élu en
 * cumule plusieurs en cours : les mandats parlementaires d'abord (ils portent
 * votes, activité, commissions, collaborateurs : les masquer parce qu'un
 * mandat local plus récent existe serait un contresens), puis exécutifs et
 * assemblées, puis les mandats dérivés d'une autre élection (communautaire,
 * arrondissement). Un type inconnu passe en dernier.
 */
export const MANDATE_TYPE_PRIORITY: readonly string[] = [
  'premier_ministre',
  'depute',
  'senateur',
  'eurodepute',
  'ministre',
  'secretaire_etat',
  'president',
  'maire',
  'conseiller_regional',
  'conseiller_departemental',
  'membre_assemblee_statut_particulier',
  'membre_afe',
  'conseiller_francais_etranger',
  'conseiller_communautaire',
  'conseiller_arrondissement',
];

/**
 * Mandat « principal » d'un élu : parmi les mandats en cours, celui de type
 * le plus prioritaire (MANDATE_TYPE_PRIORITY), à type égal le plus récent ;
 * sans mandat en cours, le dernier échu. `null` si la liste est vide. Les
 * lignes doivent au moins porter `mandateType`, `startDate` et `endDate`.
 */
export function pickPrimaryMandate<
  T extends {
    mandateType: string;
    startDate?: string | null;
    endDate: string | null;
  },
>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;
  const rank = (type: string) => {
    const index = MANDATE_TYPE_PRIORITY.indexOf(type);
    return index === -1 ? MANDATE_TYPE_PRIORITY.length : index;
  };
  const byPriority = (a: T, b: T) =>
    rank(a.mandateType) - rank(b.mandateType) ||
    (b.startDate ?? '').localeCompare(a.startDate ?? '');
  const active = rows.filter((row) => !row.endDate);
  if (active.length > 0) return [...active].sort(byPriority)[0];
  return [...rows].sort(
    (a, b) =>
      (b.endDate ?? '').localeCompare(a.endDate ?? '') || byPriority(a, b),
  )[0];
}
