export const MANDATE_TYPE_LABELS: Record<string, string> = {
  depute: 'Député',
  senateur: 'Sénateur',
  maire: 'Maire',
  eurodepute: 'Député·e européen·ne',
  conseiller_departemental: 'Conseiller départemental',
  conseiller_regional: 'Conseiller régional',
  president: 'Président',
};

export function mandateTypeLabel(type: string): string {
  return MANDATE_TYPE_LABELS[type] ?? type;
}
