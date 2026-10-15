/**
 * Construction du lien vers la fiche nominative d'un déclarant sur hatvp.fr.
 *
 * La HATVP n'expose pas d'identifiant stable par déclarant : l'URL de la
 * fiche est dérivée du nom, sous la forme `nom-prenom` en minuscules sans
 * accents. Le site s'en sert pour les liens « Source : HATVP » de la fiche
 * élu, et `sources/hatvp-status.ts` (ingest) pour sonder l'existence d'une
 * déclaration non encore publiée.
 *
 * Piège : l'ordre est nom puis prénom (convention HATVP), à l'inverse du
 * slug Elupedia (`slugifyText`, prénom puis nom).
 */

/** Plage Unicode des diacritiques combinants (accents détachés par NFD). */
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/**
 * Slug HATVP `nom-prenom` : minuscules, accents retirés, tout caractère hors
 * `[a-z0-9-]` remplacé par un tiret, tirets dédoublés et bordures nettoyées.
 */
export function buildHatvpSlug(firstName: string, lastName: string): string {
  return `${lastName}-${firstName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** URL complète de la fiche nominative du déclarant sur hatvp.fr. */
export function buildHatvpUrl(firstName: string, lastName: string): string {
  return `https://www.hatvp.fr/fiche-nominative/?declarant=${buildHatvpSlug(firstName, lastName)}`;
}
