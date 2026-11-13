/**
 * Présentation des statuts Dagu (runs et étapes) pour /logs : couleur, symbole
 * et durée lisible. Module client : actions.ts ('use server') ne peut exporter
 * que des fonctions. Daltonisme : le symbole et le libellé accompagnent
 * toujours la couleur, qui ne porte jamais l'information seule.
 */
export interface StatusStyle {
  color: string;
  symbol: string;
}

/** Statuts de run (core.Status) : 1 en cours, 2 échoué, 3 annulé, 4 réussi, 5 en file, 6 partiel. */
export function runStatusStyle(status: number): StatusStyle {
  switch (status) {
    case 4:
      return { color: 'green', symbol: '✓' };
    case 2:
    case 8:
      return { color: 'red', symbol: '✗' };
    case 6:
      return { color: 'orange', symbol: '◐' };
    case 1:
      return { color: 'blue', symbol: '▶' };
    case 3:
      return { color: 'gray', symbol: '⊘' };
    default:
      return { color: 'gray', symbol: '…' };
  }
}

/** Statuts d'étape (core.NodeStatus) : 5 ignorée, 7 réessai. */
export function stepStatusStyle(status: number): StatusStyle {
  switch (status) {
    case 4:
      return { color: 'green', symbol: '✓' };
    case 2:
      return { color: 'red', symbol: '✗' };
    case 6:
    case 7:
      return { color: 'orange', symbol: '◐' };
    case 1:
      return { color: 'blue', symbol: '▶' };
    case 3:
    case 5:
      return { color: 'gray', symbol: '⊘' };
    default:
      return { color: 'gray', symbol: '…' };
  }
}

export function isActive(status: number): boolean {
  return status === 1 || status === 5;
}

export function formatDuration(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
