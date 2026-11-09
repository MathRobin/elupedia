/**
 * Formatage français des nombres pour le livre (espace insécable comme
 * séparateur de milliers, virgule décimale). Typst ne sait pas formater les
 * nombres selon la locale : tout est mis en forme ici, avant d'écrire
 * `data.json`.
 *
 * Appelants : `facts.ts`.
 */

const NBSP = '\u00a0';
const NARROW_NBSP = '\u202f';

/** « 13 427 ». */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR').replaceAll(NARROW_NBSP, NBSP);
}

/** « 3,6 » (virgule décimale, nombre de décimales fixe). */
export function formatDecimal(n: number, decimals = 1): string {
  return n
    .toLocaleString('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    .replaceAll(NARROW_NBSP, NBSP);
}

/** « 69 % » ; chaîne vide si le total est nul. */
export function formatPercent(
  part: number,
  total: number,
  decimals = 0,
): string {
  if (total === 0) return '';
  return `${formatDecimal((part / total) * 100, decimals)}${NBSP}%`;
}

/** Montant en millions d'euros : « 147,9 M€ ». */
export function formatMillions(euros: number): string {
  return `${formatDecimal(euros / 1_000_000, 1)}${NBSP}M€`;
}

/** Montant en euros : « 28 654 € ». */
export function formatEuros(euros: number): string {
  return `${formatInt(euros)}${NBSP}€`;
}
