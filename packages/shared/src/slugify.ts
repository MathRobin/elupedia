/**
 * Génération de slugs URL à partir d'un texte libre (nom d'élu, nom de
 * commission...).
 *
 * Utilisé côté ingest pour fabriquer `officials.slug` (ex. « Manuel
 * Bompard » → `manuel-bompard`) et côté site pour les URLs
 * `/commissions/{slug}`, où le slug est recalculé à la volée depuis le nom
 * de la commission : toute modification de cette fonction change donc des
 * URLs publiques existantes.
 *
 * Ne pas confondre avec `buildHatvpSlug` (hatvp-url.ts), qui suit la
 * convention propre au site de la HATVP (nom-prénom).
 */

/** Plage Unicode des diacritiques combinants (accents détachés par NFD). */
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/**
 * Transforme un texte en slug ASCII minuscule : accents retirés, toute
 * séquence de caractères hors `[a-z0-9]` remplacée par un tiret unique,
 * tirets de bordure supprimés.
 */
export function slugifyText(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(COMBINING_DIACRITICS, '')
      .toLowerCase()
      // Apostrophes → tiret (« d'Armor » → « d-armor »). Redondant avec
      // l'étape suivante, conservé tel quel pour ne pas changer la sortie.
      .replace(/['']/g, '-')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}
