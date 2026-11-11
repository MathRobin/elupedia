/**
 * Configuration déclarative des annuaires de groupes parlementaires (ticket
 * #274, M25T2) : une entrée par groupe de la 17e législature dont la page
 * « annuaire » liste des députés et leurs réseaux sociaux.
 *
 * Aucun appel réseau ici : ce module décrit les sources (URL et sélecteurs
 * CSS) et les valide. Le scraping qui les consommera est un ticket à part.
 *
 * Source des valeurs : URL des pages de groupes issues du tableau du ticket
 * #273 (M25T1). Les sélecteurs ont été relevés dans le DOM réel des pages
 * www2.assemblee-nationale.fr/17/les-groupes-politiques/… (liste des membres)
 * et de la fiche député (liens sociaux), le 11/11/2026.
 *
 * Groupes non inclus faute de liste exploitable sur la page de groupe (aucun
 * `li[data-acteur-id]` trouvé) : LFI-NFP, EcoS, GDR, députés non inscrits.
 * Structure à relever à part avant de les ajouter.
 *
 * Pas de robots.txt sur www2.assemblee-nationale.fr (404) à cette date.
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

const GROUP_PAGE_BASE =
  'https://www2.assemblee-nationale.fr/17/les-groupes-politiques/';

/** Liste des membres : un `li[data-acteur-id]` par député. */
const MEMBER_ITEM_SELECTOR = 'li[data-acteur-id]';
/** Nom du député, lien vers sa fiche. */
const MEMBER_NAME_SELECTOR = 'a.instance-composition-nom';
/** Liens du député sur la fiche (bloc « button-list _vertical », hors menu AN). */
const FICHE_SOCIAL_SELECTOR = 'ul.button-list._vertical a';

/** Entrées vérifiées sur la page du groupe (voir en-tête). */
export const GROUP_DIRECTORY_SOURCES: GroupDirectorySource[] = [
  {
    groupCode: 'RN',
    groupName: 'Rassemblement National',
    listUrl: `${GROUP_PAGE_BASE}rassemblement-national`,
    listItemSelector: MEMBER_ITEM_SELECTOR,
    nameSelector: MEMBER_NAME_SELECTOR,
    socialLinkSelector: FICHE_SOCIAL_SELECTOR,
    followsToDetailPage: true,
    detailLinkSelector: MEMBER_NAME_SELECTOR,
    enabled: true,
  },
  {
    groupCode: 'EPR',
    groupName: 'Ensemble pour la République',
    listUrl: `${GROUP_PAGE_BASE}ensemble-pour-la-republique`,
    listItemSelector: MEMBER_ITEM_SELECTOR,
    nameSelector: MEMBER_NAME_SELECTOR,
    socialLinkSelector: FICHE_SOCIAL_SELECTOR,
    followsToDetailPage: true,
    detailLinkSelector: MEMBER_NAME_SELECTOR,
    enabled: true,
  },
  {
    groupCode: 'SOC',
    groupName: 'Socialistes et apparentés',
    listUrl: `${GROUP_PAGE_BASE}socialistes-et-apparentes`,
    listItemSelector: MEMBER_ITEM_SELECTOR,
    nameSelector: MEMBER_NAME_SELECTOR,
    socialLinkSelector: FICHE_SOCIAL_SELECTOR,
    followsToDetailPage: true,
    detailLinkSelector: MEMBER_NAME_SELECTOR,
    enabled: true,
  },
  {
    groupCode: 'DR',
    groupName: 'Droite Républicaine',
    listUrl: `${GROUP_PAGE_BASE}droite-republicaine`,
    listItemSelector: MEMBER_ITEM_SELECTOR,
    nameSelector: MEMBER_NAME_SELECTOR,
    socialLinkSelector: FICHE_SOCIAL_SELECTOR,
    followsToDetailPage: true,
    detailLinkSelector: MEMBER_NAME_SELECTOR,
    enabled: true,
  },
  {
    groupCode: 'Dem',
    groupName: 'Les Démocrates',
    listUrl: `${GROUP_PAGE_BASE}les-democrates`,
    listItemSelector: MEMBER_ITEM_SELECTOR,
    nameSelector: MEMBER_NAME_SELECTOR,
    socialLinkSelector: FICHE_SOCIAL_SELECTOR,
    followsToDetailPage: true,
    detailLinkSelector: MEMBER_NAME_SELECTOR,
    enabled: true,
  },
  {
    groupCode: 'HOR',
    groupName: 'Horizons & Indépendants',
    listUrl: `${GROUP_PAGE_BASE}horizons-independants`,
    listItemSelector: MEMBER_ITEM_SELECTOR,
    nameSelector: MEMBER_NAME_SELECTOR,
    socialLinkSelector: FICHE_SOCIAL_SELECTOR,
    followsToDetailPage: true,
    detailLinkSelector: MEMBER_NAME_SELECTOR,
    enabled: true,
  },
  {
    groupCode: 'LIOT',
    groupName: 'Libertés, Indépendants, Outre-mer et Territoires',
    listUrl: `${GROUP_PAGE_BASE}libertes-independants-outre-mer-et-territoires`,
    listItemSelector: MEMBER_ITEM_SELECTOR,
    nameSelector: MEMBER_NAME_SELECTOR,
    socialLinkSelector: FICHE_SOCIAL_SELECTOR,
    followsToDetailPage: true,
    detailLinkSelector: MEMBER_NAME_SELECTOR,
    enabled: true,
  },
  {
    groupCode: 'UDR',
    groupName: 'Union des droites pour la République',
    listUrl: `${GROUP_PAGE_BASE}union-des-droites-pour-la-republique`,
    listItemSelector: MEMBER_ITEM_SELECTOR,
    nameSelector: MEMBER_NAME_SELECTOR,
    socialLinkSelector: FICHE_SOCIAL_SELECTOR,
    followsToDetailPage: true,
    detailLinkSelector: MEMBER_NAME_SELECTOR,
    enabled: true,
  },
];

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
