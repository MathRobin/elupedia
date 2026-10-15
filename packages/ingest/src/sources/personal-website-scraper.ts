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
 * invalides sont ignorés.
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
      const canonical = resolved.href;
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
