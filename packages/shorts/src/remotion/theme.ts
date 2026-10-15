export const COLORS = {
  bgTop: '#0f172a',
  bgBottom: '#1e293b',
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#60a5fa',
  for: '#10b981',
  against: '#ef4444',
  abstain: '#f59e0b',
  absent: '#475569',
  band: 'rgba(15, 23, 42, 0.72)',
} as const;

export const FONT = 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';

export const POSITION_LABELS: Record<string, string> = {
  for: 'Pour',
  against: 'Contre',
  abstain: 'Abstention',
  absent: 'Absents',
  pour: 'Pour',
  contre: 'Contre',
  abstention: 'Abstention',
};

/** Sigle entre parenthèses d'un libellé de groupe, sinon le libellé. */
export function shortGroupName(name: string): string {
  const m = name.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : name;
}
