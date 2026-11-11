/**
 * Configuration déclarative des annuaires de groupes parlementaires (ticket
 * #274, M25T2) : une entrée par groupe de la 17e législature dont la page
 * « annuaire » liste des députés et leurs réseaux sociaux.
 *
 * Aucun appel réseau ici : ce module décrit les sources (URL et sélecteurs
 * CSS) et les valide. Le scraping qui les consommera est un ticket à part.
 *
 * Source des valeurs : tableau d'inventaire produit à la main dans le ticket
 * #273 (M25T1). Tant que ce tableau n'est pas posté, `GROUP_DIRECTORY_SOURCES`
 * reste vide : aucune source n'est exploitable.
 *
 * Appelé par : main-group-directories.ts (affichage de debug, validation).
 *
 * Pièges : `groupCode` sert de clé unique (doublons refusés par la
 * validation). Un sélecteur vide ou une URL non http(s) fait échouer la
 * validation avant tout scraping. `followsToDetailPage = true` impose un
 * `detailLinkSelector`.
 */

export interface GroupDirectorySource {
  /** Code court du groupe, unique (ex. « RN », « EPR »). */
  groupCode: string;
  /** Libellé complet du groupe. */
  groupName: string;
  /** URL de la page listant les députés du groupe. */
  listUrl: string;
  /** Sélecteur CSS d'une entrée de député sur la page de liste. */
  listItemSelector: string;
  /** Sélecteur CSS du nom, à l'intérieur d'une entrée. */
  nameSelector: string;
  /** Sélecteur CSS des liens de réseaux sociaux (page de liste ou fiche). */
  socialLinkSelector: string;
  /** true si les liens sociaux ne figurent que sur la fiche individuelle. */
  followsToDetailPage: boolean;
  /** Sélecteur CSS du lien vers la fiche, requis si followsToDetailPage. */
  detailLinkSelector: string | null;
  /** Désactive une source sans la supprimer de la configuration. */
  enabled: boolean;
}

/**
 * Entrées à compléter depuis le tableau du ticket #273. Vide tant qu'il
 * n'est pas posté.
 */
export const GROUP_DIRECTORY_SOURCES: GroupDirectorySource[] = [];

const SELECTOR_FIELDS = [
  'listItemSelector',
  'nameSelector',
  'socialLinkSelector',
] as const;

/**
 * Vérifie la forme d'une liste de sources. Retourne la liste des erreurs
 * (vide si tout est valide), sans lever d'exception, pour que le débogage
 * montre tous les problèmes d'un coup.
 */
export function validateGroupDirectorySources(
  sources: readonly GroupDirectorySource[],
): string[] {
  const errors: string[] = [];
  const seenCodes = new Set<string>();

  for (const [index, source] of sources.entries()) {
    const label = source.groupCode || `entrée #${index}`;

    if (!source.groupCode || source.groupCode.trim() === '') {
      errors.push(`${label} : groupCode vide`);
    } else if (seenCodes.has(source.groupCode)) {
      errors.push(`${label} : groupCode en double`);
    } else {
      seenCodes.add(source.groupCode);
    }

    if (!source.groupName || source.groupName.trim() === '') {
      errors.push(`${label} : groupName vide`);
    }

    if (!isHttpUrl(source.listUrl)) {
      errors.push(`${label} : listUrl invalide (${source.listUrl})`);
    }

    for (const field of SELECTOR_FIELDS) {
      const value = source[field];
      if (!value || value.trim() === '') {
        errors.push(`${label} : ${field} vide`);
      }
    }

    if (typeof source.followsToDetailPage !== 'boolean') {
      errors.push(`${label} : followsToDetailPage doit être un booléen`);
    }

    if (source.followsToDetailPage) {
      if (
        !source.detailLinkSelector ||
        source.detailLinkSelector.trim() === ''
      ) {
        errors.push(
          `${label} : detailLinkSelector requis quand followsToDetailPage est vrai`,
        );
      }
    }

    if (typeof source.enabled !== 'boolean') {
      errors.push(`${label} : enabled doit être un booléen`);
    }
  }

  return errors;
}

/** Sources à interroger : celles marquées `enabled`, dans l'ordre de config. */
export function getEnabledGroupDirectorySources(
  sources: readonly GroupDirectorySource[] = GROUP_DIRECTORY_SOURCES,
): GroupDirectorySource[] {
  return sources.filter((source) => source.enabled);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
