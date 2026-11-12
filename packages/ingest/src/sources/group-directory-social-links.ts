/**
 * Extraction générique des liens sociaux depuis une page d'annuaire de
 * groupe parlementaire (ticket #275, M25T3). Brique indépendante de la
 * source : les sélecteurs viennent de GroupDirectorySource
 * (config/group-directories.ts).
 *
 * Deux usages :
 *   - `extractSocialLinks` : page de liste, une entrée par député
 *     (`listItemSelector`), nom (`nameSelector`) et liens
 *     (`socialLinkSelector`) relus dans chaque entrée ;
 *   - `extractPageSocialLinks` : fiche individuelle (`followsToDetailPage`),
 *     liens relus sur la page entière.
 *
 * Normalisation (`normalizeSocialUrl`) : plateforme classée par domaine
 * (x, facebook, instagram, youtube, tiktok, linkedin, bluesky, mastodon),
 * hôte et chemin réécrits sous une forme canonique, paramètres de requête et
 * fragments supprimés, handle en minuscules (sauf identifiant de chaîne
 * YouTube `UC…`, sensible à la casse). Tout autre lien est rejeté.
 *
 * Pièges :
 * - Les liens de la liste d'un groupe ne sont pas toujours là : sur les pages
 *   de liste de l'Assemblée, les réseaux sociaux ne figurent que sur la
 *   fiche. Un résultat vide n'est pas une erreur.
 * - Le nom affiché contient des espaces insécables (`&nbsp;`) : ils sont
 *   remplacés par des espaces.
 * - twitter.com et x.com sont la même plateforme (`x`) ; la table
 *   `external_links` utilise encore `twitter` : la correspondance se fait à
 *   l'upsert, pas ici.
 * - `DEFAULT_EXCLUDED_HANDLES` ne couvre que les comptes de l'Assemblée. Les
 *   comptes d'un groupe ou d'un parti s'ajoutent via `options.excludedHandles`.
 * - Les liens relatifs sont ignorés : aucun réseau social n'est relatif.
 *
 * Appelé par : (à venir) le scraping des annuaires de groupes. Testé sur des
 * fixtures HTML statiques de sources/fixtures/group-directories/.
 */
import * as cheerio from 'cheerio';
import type { GroupDirectorySource } from '../config/group-directories.js';

export type SocialPlatform =
  | 'x'
  | 'facebook'
  | 'instagram'
  | 'youtube'
  | 'tiktok'
  | 'linkedin'
  | 'bluesky'
  | 'mastodon';

export interface SocialLink {
  platform: SocialPlatform;
  /** URL canonique (https, sans paramètres ni slash final). */
  url: string;
  /** Identifiant du compte, en minuscules (sauf chaîne YouTube `UC…`). */
  handle: string;
}

export interface MemberSocialLinks {
  /** Nom affiché, espaces normalisés ; null si le sélecteur ne trouve rien. */
  name: string | null;
  links: SocialLink[];
}

export interface SocialLinkOptions {
  /** Handles (minuscules) à écarter, comptes institutionnels du groupe ou du parti. */
  excludedHandles?: readonly string[];
}

/** Sélecteurs nécessaires à l'extraction (sous-ensemble de GroupDirectorySource). */
export type ExtractionSelectors = Pick<
  GroupDirectorySource,
  'listItemSelector' | 'nameSelector' | 'socialLinkSelector'
>;

/** Comptes de l'Assemblée nationale, présents sur chaque page (menu, pied). */
export const DEFAULT_EXCLUDED_HANDLES: readonly string[] = [
  'assembleenationale',
  'assembleenat',
  'assemblee-nationale',
];

/** Domaine (ou sous-domaine) → plateforme. Le domaine doit correspondre exactement ou en suffixe. */
const DOMAIN_PLATFORMS: ReadonlyArray<readonly [string, SocialPlatform]> = [
  ['x.com', 'x'],
  ['twitter.com', 'x'],
  ['facebook.com', 'facebook'],
  ['fb.com', 'facebook'],
  ['instagram.com', 'instagram'],
  ['youtube.com', 'youtube'],
  ['youtu.be', 'youtube'],
  ['tiktok.com', 'tiktok'],
  ['linkedin.com', 'linkedin'],
  ['bsky.app', 'bluesky'],
];

/**
 * Instances Mastodon connues. Un domaine Mastodon est arbitraire : seules les
 * instances listées ici sont reconnues.
 */
const MASTODON_HOSTS: readonly string[] = [
  'mastodon.social',
  'mastodon.online',
  'mastodon.art',
  'framapiaf.org',
  'piaille.fr',
];

/** Premiers segments qui ne sont pas des comptes. */
const X_RESERVED = new Set([
  'home',
  'intent',
  'share',
  'search',
  'hashtag',
  'i',
  'explore',
  'notifications',
  'messages',
  'settings',
  'login',
  'signup',
  'oauth',
]);
const FACEBOOK_RESERVED = new Set([
  'sharer',
  'sharer.php',
  'share',
  'plugins',
  'dialog',
  'tr',
  'watch',
  'groups',
  'events',
  'pages',
  'photo',
  'photos',
  'video',
  'videos',
  'reel',
  'reels',
  'hashtag',
]);
const INSTAGRAM_RESERVED = new Set([
  'p',
  'reel',
  'reels',
  'explore',
  'accounts',
  'stories',
  'direct',
  'tv',
]);

const X_HANDLE = /^[a-z0-9_]{1,15}$/;
const FACEBOOK_HANDLE = /^[a-z0-9.]{3,}$/;
const FACEBOOK_ID = /^\d+$/;
const INSTAGRAM_HANDLE = /^[a-z0-9._]{1,30}$/;
const TIKTOK_HANDLE = /^[a-z0-9._]{2,24}$/;
const LINKEDIN_SLUG = /^[a-z0-9-]{3,100}$/;
const BLUESKY_HANDLE = /^[a-z0-9.-]{3,}$/;
const MASTODON_HANDLE = /^[a-z0-9_]{1,30}$/;
const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

function hostPlatform(hostname: string): SocialPlatform | null {
  for (const [domain, platform] of DOMAIN_PLATFORMS) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) return platform;
  }
  return null;
}

function mastodonHost(hostname: string): string | null {
  return MASTODON_HOSTS.includes(hostname) ? hostname : null;
}

/**
 * Normalise une URL de réseau social. Renvoie null si l'URL n'est pas un
 * profil reconnu, si elle est relative, ou si son compte est exclu.
 */
export function normalizeSocialUrl(
  rawHref: string,
  options: SocialLinkOptions = {},
): SocialLink | null {
  const link = toCanonicalLink(rawHref.trim());
  if (!link) return null;
  const excluded = options.excludedHandles ?? DEFAULT_EXCLUDED_HANDLES;
  if (excluded.includes(link.handle.toLowerCase())) return null;
  return link;
}

function toCanonicalLink(href: string): SocialLink | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const hostname = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  const platform = hostPlatform(hostname);

  if (platform) return canonicalForPlatform(platform, hostname, segments, url);

  const mastodon = mastodonHost(hostname);
  if (mastodon && segments.length === 1 && segments[0]!.startsWith('@')) {
    const handle = segments[0]!.slice(1).toLowerCase();
    if (!MASTODON_HANDLE.test(handle)) return null;
    return {
      platform: 'mastodon',
      url: `https://${mastodon}/@${handle}`,
      handle,
    };
  }
  return null;
}

function canonicalForPlatform(
  platform: SocialPlatform,
  hostname: string,
  segments: string[],
  url: URL,
): SocialLink | null {
  switch (platform) {
    case 'x': {
      if (segments.length !== 1) return null;
      const handle = segments[0]!.replace(/^@/, '').toLowerCase();
      if (X_RESERVED.has(handle) || !X_HANDLE.test(handle)) return null;
      return { platform, url: `https://x.com/${handle}`, handle };
    }
    case 'facebook': {
      // Profil sans nom d'utilisateur : /profile.php?id=…, seul paramètre gardé.
      if (segments.length === 1 && segments[0] === 'profile.php') {
        const id = url.searchParams.get('id');
        if (!id || !FACEBOOK_ID.test(id)) return null;
        return {
          platform,
          url: `https://www.facebook.com/profile.php?id=${id}`,
          handle: id,
        };
      }
      if (segments.length !== 1) return null;
      const handle = segments[0]!.toLowerCase();
      if (FACEBOOK_RESERVED.has(handle) || !FACEBOOK_HANDLE.test(handle)) {
        return null;
      }
      return { platform, url: `https://www.facebook.com/${handle}`, handle };
    }
    case 'instagram': {
      if (segments.length !== 1) return null;
      const handle = segments[0]!.toLowerCase();
      if (INSTAGRAM_RESERVED.has(handle) || !INSTAGRAM_HANDLE.test(handle)) {
        return null;
      }
      return { platform, url: `https://www.instagram.com/${handle}`, handle };
    }
    case 'youtube': {
      if (hostname.endsWith('youtu.be')) return null;
      const [first, second] = segments;
      if (!first) return null;
      if (first.startsWith('@')) {
        const handle = first.slice(1).toLowerCase();
        if (!handle) return null;
        return {
          platform,
          url: `https://www.youtube.com/@${handle}`,
          handle,
        };
      }
      if (first === 'channel' && second && YOUTUBE_CHANNEL_ID.test(second)) {
        return {
          platform,
          url: `https://www.youtube.com/channel/${second}`,
          handle: second,
        };
      }
      if ((first === 'c' || first === 'user') && second) {
        const handle = second.toLowerCase();
        return {
          platform,
          url: `https://www.youtube.com/${first}/${handle}`,
          handle,
        };
      }
      // Forme historique « /<nom> » et pages (watch, shorts…) : rejetées.
      return null;
    }
    case 'tiktok': {
      if (segments.length !== 1) return null;
      const handle = segments[0]!.toLowerCase();
      if (!handle.startsWith('@') || !TIKTOK_HANDLE.test(handle.slice(1))) {
        return null;
      }
      return {
        platform,
        url: `https://www.tiktok.com/${handle}`,
        handle: handle.slice(1),
      };
    }
    case 'linkedin': {
      if (segments.length !== 2) return null;
      const [kind, slug] = segments as [string, string];
      if (kind !== 'in' && kind !== 'company') return null;
      const handle = slug.toLowerCase();
      if (!LINKEDIN_SLUG.test(handle)) return null;
      return {
        platform,
        url: `https://www.linkedin.com/${kind}/${handle}`,
        handle,
      };
    }
    case 'bluesky': {
      if (segments.length !== 2 || segments[0] !== 'profile') return null;
      const handle = segments[1]!.toLowerCase();
      if (!BLUESKY_HANDLE.test(handle)) return null;
      return { platform, url: `https://bsky.app/profile/${handle}`, handle };
    }
    case 'mastodon':
      return null;
  }
}

/** Texte visible : espaces insécables remplacés, espaces répétés réduits. */
function cleanText(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Liens normalisés d'un conteneur, dédoublonnés par URL canonique. */
function linksWithin(
  $: cheerio.CheerioAPI,
  root: ReturnType<cheerio.CheerioAPI>,
  socialLinkSelector: string,
  options: SocialLinkOptions,
): SocialLink[] {
  const seen = new Map<string, SocialLink>();
  root.find(socialLinkSelector).each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const link = normalizeSocialUrl(href, options);
    if (link && !seen.has(link.url)) seen.set(link.url, link);
  });
  return [...seen.values()];
}

/**
 * Page de liste : pour chaque entrée (`listItemSelector`), le nom et les
 * liens sociaux qu'elle contient. Les entrées sont renvoyées dans l'ordre de
 * la page, sans filtre : une entrée sans lien garde `links: []`.
 */
export function extractSocialLinks(
  html: string,
  source: ExtractionSelectors,
  options: SocialLinkOptions = {},
): MemberSocialLinks[] {
  const $ = cheerio.load(html);
  const members: MemberSocialLinks[] = [];
  $(source.listItemSelector).each((_, item) => {
    const $item = $(item);
    const nameText = $item.find(source.nameSelector).first().text();
    const name = cleanText(nameText) || null;
    members.push({
      name,
      links: linksWithin($, $item, source.socialLinkSelector, options),
    });
  });
  return members;
}

/** Fiche individuelle : les liens sociaux de la page entière. */
export function extractPageSocialLinks(
  html: string,
  socialLinkSelector: string,
  options: SocialLinkOptions = {},
): SocialLink[] {
  const $ = cheerio.load(html);
  return linksWithin($, $(':root'), socialLinkSelector, options);
}
