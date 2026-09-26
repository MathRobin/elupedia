export const MANDATE_TYPE_LABELS: Record<string, string> = {
  depute: 'Député',
  senateur: 'Sénateur',
  maire: 'Maire',
  eurodepute: 'Député·e européen·ne',
  conseiller_departemental: 'Conseiller départemental',
  conseiller_regional: 'Conseiller régional',
  conseiller_arrondissement: "Conseiller d'arrondissement",
  membre_assemblee_statut_particulier: "Membre d'assemblée territoriale",
  president: 'Président',
};

export function mandateTypeLabel(type: string): string {
  return MANDATE_TYPE_LABELS[type] ?? type;
}
