/**
 * Clé de comparaison d'un nom de personne entre sources.
 *
 * Les sources n'écrivent pas les noms de la même façon : l'AN et le Sénat
 * en casse normale avec accents (« Jean-Yves Bony »), le RNE en capitales
 * sans accent et parfois sans trait d'union (« Jean Yves BONY »). Comparer
 * les chaînes brutes créait une fiche par écriture pour la même personne.
 *
 * La clé retire les accents, passe en minuscules et ramène toute séquence
 * hors lettres/chiffres (espaces, tirets, apostrophes, « / » de K/Bidi) à
 * un espace unique. Elle sert à rapprocher, jamais à afficher ni à stocker.
 */

/** Plage Unicode des diacritiques combinants (accents détachés par NFD). */
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function normalizePersonName(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
