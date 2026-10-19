/**
 * Forme canonique d'une URL stockée dans `external_links.url`, partagée par
 * tous les modules d'ingestion qui écrivent ou comparent des liens (AN,
 * Sénat, DILA, scraping des sites perso, Wikipédia).
 *
 * Deux liens qui ne diffèrent que par un slash final, la casse du domaine ou
 * un port par défaut désignent la même page : sans forme canonique, la base
 * accumulait des doublons (`…/compte` et `…/compte/`) et les sources se
 * réécrivaient mutuellement la même URL à chaque run.
 *
 * Conservé tel quel : le schéma (http/https), le sous-domaine `www.`, la
 * casse du chemin (significative sur certains sites), la query string.
 * Une chaîne qui n'est pas une URL absolue est renvoyée simplement trimée.
 */
export function normalizeExternalLinkUrl(raw: string): string {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return trimmed;
  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${pathname}${url.search}`;
}

/**
 * Clé de comparaison plus large que la forme canonique : ignore aussi le
 * schéma et `www.`. Sert à repérer des doublons entre sources qui publient
 * la même page sous deux écritures (`http://www.site.fr/` et
 * `https://site.fr`). Ne pas stocker : c'est une clé, pas une URL.
 */
export function externalLinkComparisonKey(raw: string): string {
  return normalizeExternalLinkUrl(raw)
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '');
}
