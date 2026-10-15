import type { BallotResult } from '@elupedia/shared';

/**
 * Normalise le résultat brut d'un scrutin en `adopted` / `rejected`.
 * - AN : `sort.code` (« adopté », « rejeté »)
 * - Sénat : suffixe de l'index (« Adoption », « Rejet »)
 * Renvoie `null` si la source n'indique rien d'exploitable.
 */
export function normalizeBallotResult(
  raw: string | null | undefined,
): BallotResult | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v.startsWith('adopt')) return 'adopted';
  if (v.startsWith('rejet') || v.startsWith('reject')) return 'rejected';
  return null;
}
