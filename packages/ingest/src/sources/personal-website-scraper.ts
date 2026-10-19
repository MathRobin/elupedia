/**
 * Détection de comptes Instagram / TikTok / YouTube sur le site personnel
 * d'un élu.
 *
 * Source : la page d'accueil du site (HTML, scraping) après vérification
 * minimale de son robots.txt. Les liens sont extraits des attributs `href`
 * et résolus par rapport à l'URL du site ; seuls ceux pointant vers un
 * domaine reconnu par domainToPlatform sont retenus, dédoublonnés sur l'URL
 * canonique.
 *
 * Pièges :
 * - robots.txt n'est honoré que pour `Disallow: /` dans le bloc `*` ou
 *   `ElupediaBot` ; en cas d'absence ou d'erreur, le scraping est autorisé.
 * - Timeouts courts (ROBOTS_TIMEOUT_MS, PAGE_TIMEOUT_MS) : un site lent est
 *   simplement ignoré.
 * - Pas de suivi de pages internes : seule l'URL fournie est lue.
 *
 * Appelé par run-social-links.ts via upsert/mayor-social-scrape.ts et
 * upsert/scraped-links.ts.
 */
const USER_AGENT =
  'ElupediaBot/1.0 (+https://www.elupedia.fr/mentions-legales)';
/** Nom du bot tel qu'attendu dans robots.txt (en minuscules). */
const ROBOTS_AGENT_NAME = 'elupediabot';

const ROBOTS_TIMEOUT_MS = 5000;
const PAGE_TIMEOUT_MS = 10000;

type SocialPlatform = 'instagram' | 'tiktok' | 'youtube';

export interface DetectedLink {
  platform: SocialPlatform;
  url: string;
}

/** Suffixe de domaine → plateforme. */
function domainToPlatform(hostname: string): SocialPlatform | null {
  if (hostname.endsWith('instagram.com')) return 'instagram';
  if (hostname.endsWith('tiktok.com')) return 'tiktok';
  if (hostname.endsWith('youtube.com')) return 'youtube';
  return null;
}

/**
 * Lien YouTube vers une vidéo précise (lecteur embarqué, page de lecture,
 * short) plutôt que vers une chaîne. On cherche la chaîne de l'élu : ces
 * liens sont écartés, ils ne mèneraient qu'à une vidéo isolée. Les formes de
 * chaîne sont trop variées (/@x, /channel/x, /c/x, /user/x, avec ou sans
 * onglet) pour une liste blanche : on écarte les formes de vidéo connues.
 */
const YOUTUBE_VIDEO_PATH = /^\/(embed|watch|shorts)(\/|$)/i;

/**
 * Pseudo Instagram : lettres, chiffres, points et tirets bas, 30 max.
 * Segments réservés qui ne sont pas des comptes (publications, reels,
 * hashtags, stories…).
 */
const INSTAGRAM_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const INSTAGRAM_RESERVED = new Set([
  'p',
  'reel',
  'reels',
  'stories',
  'explore',
  'accounts',
  'tags',
  'share',
  'direct',
]);

/** Pseudo TikTok (après le « @ ») : lettres, chiffres, points et tirets bas. */
const TIKTOK_HANDLE = /^@[A-Za-z0-9._]{1,24}$/;

/**
 * URL canonique du profil si le lien désigne bien un compte, sinon null.
 * Instagram et TikTok ont une forme de profil unique, on la vérifie
 * strictement : tout le reste (post /p/…, reel, hashtag /explore/tags/…,
 * musique /music/…, vidéo /@x/video/…, image CDN) est écarté. Le suffixe
 * `/profilecard` d'Instagram est ramené au profil.
 */
function canonicalProfileUrl(
  platform: SocialPlatform,
  url: URL,
): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  switch (platform) {
    case 'instagram': {
      if (segments.length === 2 && segments[1] === 'profilecard') {
        segments.pop();
      }
      const [handle] = segments;
      if (segments.length !== 1 || !handle) return null;
      if (INSTAGRAM_RESERVED.has(handle.toLowerCase())) return null;
      if (!INSTAGRAM_HANDLE.test(handle)) return null;
      return `https://www.instagram.com/${handle}`;
    }
    case 'tiktok': {
      const [handle] = segments;
      if (segments.length !== 1 || !handle || !TIKTOK_HANDLE.test(handle)) {
        return null;
      }
      return `https://www.tiktok.com/${handle}`;
    }
    case 'youtube':
      return YOUTUBE_VIDEO_PATH.test(url.pathname) ? null : url.href;
  }
}

/**
 * Lit le robots.txt du site et renvoie false uniquement si la racine est
 * interdite pour tous les robots ou pour ElupediaBot. Toute erreur (pas de
 * fichier, timeout, URL invalide) vaut autorisation.
 */
export async function checkRobotsTxt(
  siteUrl: string,
  fetchFn = globalThis.fetch,
): Promise<boolean> {
  try {
    const origin = new URL(siteUrl).origin;
    const response = await fetchFn(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
    });
    if (!response.ok) return true;
    const text = await response.text();
    let inOurBlock = false;
    let inWildcardBlock = false;
    for (const rawLine of text.split('\n')) {
      // Commentaires (#) ignorés.
      const line = rawLine.trim().split('#')[0].trim();
      if (!line) continue;
      const [directive, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      if (directive.toLowerCase() === 'user-agent') {
        const agent = value.toLowerCase();
        inOurBlock = agent === ROBOTS_AGENT_NAME;
        inWildcardBlock = agent === '*';
      } else if (directive.toLowerCase() === 'disallow') {
        if ((inOurBlock || inWildcardBlock) && value === '/') return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Extrait les liens vers les plateformes supportées d'un document HTML.
 * `baseUrl` sert à résoudre les URL relatives ; les liens non http(s) ou
 * invalides sont ignorés, ainsi que tout lien qui ne désigne pas un compte
 * (vidéo YouTube, post ou hashtag Instagram, vidéo ou musique TikTok ; voir
 * canonicalProfileUrl). Les profils Instagram et TikTok sont renvoyés sous
 * forme canonique (www, sans slash final).
 */
export function extractSocialLinks(
  html: string,
  baseUrl: string,
): DetectedLink[] {
  const seen = new Set<string>();
  const results: DetectedLink[] = [];
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:')
        continue;
      const platform = domainToPlatform(resolved.hostname);
      if (!platform) continue;
      const canonical = canonicalProfileUrl(platform, resolved);
      if (!canonical) continue;
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      results.push({ platform, url: canonical });
    } catch {
      // URL invalide : ignorée.
    }
  }
  return results;
}

/**
 * Vérifie robots.txt puis lit la page `siteUrl` et renvoie les liens sociaux
 * détectés. Renvoie [] si le scraping est interdit ou si la page est
 * inaccessible ; lève sur timeout de la page (AbortSignal).
 */
export async function scrapePersonalWebsite(
  siteUrl: string,
  fetchFn = globalThis.fetch,
): Promise<DetectedLink[]> {
  const allowed = await checkRobotsTxt(siteUrl, fetchFn);
  if (!allowed) return [];

  const response = await fetchFn(siteUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });
  if (!response.ok) return [];

  const html = await response.text();
  return extractSocialLinks(html, siteUrl);
}
