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
 */
export const MANDATE_TYPE_LABELS: Record<string, string> = {
  depute: 'Député',
  senateur: 'Sénateur',
  maire: 'Maire',
  eurodepute: 'Député·e européen·ne',
  conseiller_departemental: 'Conseiller départemental',
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
