/**
 * Réseaux sociaux et sites internet de tous les députés (listes AN).
 *
 * Source : deux pages HTML de www2.assemblee-nationale.fr (scraping) :
 * - /deputes/liste/reseaux-sociaux : un `<tr>` par député avec des
 *   `<a class="facebook|twitter" href="…">` ;
 * - /deputes/liste/site-internet : un `<tr>` par député avec des `<li><a
 *   href="…">` (sites personnels).
 * Dans les deux cas, l'identifiant AN est lu dans le lien vers la fiche
 * (`/fiche/OMC_PAxxxx`).
 *
 * Extrait : une `SocialLinkData` par lien, plateforme typée.
 *
 * Pièges : les URL contiennent parfois des espaces/retours à la ligne
 * (normalizeUrl les supprime). Instagram n'apparaît pas sur ces listes :
 * voir an-fiche-sociale.ts.
 *
 * Appelé par run-social-links.ts via upsert/social-links.ts.
 */
const SOCIAL_URL =
  'https://www2.assemblee-nationale.fr/deputes/liste/reseaux-sociaux';

const WEBSITE_URL =
  'https://www2.assemblee-nationale.fr/deputes/liste/site-internet';

export type AnLinkPlatform =
  'facebook' | 'twitter' | 'instagram' | 'personal_website';

export interface SocialLinkData {
  anId: string;
  platform: AnLinkPlatform;
  url: string;
}

/** Lien vers la fiche du député dans une ligne de tableau → identifiant AN. */
const FICHE_ID_REGEX = /href="[^"]*\/fiche\/OMC_(PA\d+)"/;

function normalizeUrl(raw: string): string {
  return raw.trim().replace(/\s+/g, '');
}

/** Itère sur le contenu de chaque `<tr>` de la page. */
function* tableRows(html: string): Generator<string> {
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    yield rowMatch[1];
  }
}

function extractAnId(rowContent: string): string | undefined {
  const ficheMatch = FICHE_ID_REGEX.exec(rowContent);
  return ficheMatch ? ficheMatch[1] : undefined;
}

function parseSocialPage(html: string): SocialLinkData[] {
  const results: SocialLinkData[] = [];

  for (const rowContent of tableRows(html)) {
    const anId = extractAnId(rowContent);
    if (!anId) continue;

    const linkRegex = /<a\s+class="(facebook|twitter)"\s+href="([^"]+)"/gi;
    let linkMatch: RegExpExecArray | null;

    while ((linkMatch = linkRegex.exec(rowContent)) !== null) {
      const platform = linkMatch[1] as 'facebook' | 'twitter';
      const url = normalizeUrl(linkMatch[2]);
      if (url) {
        results.push({ anId, platform, url });
      }
    }
  }

  return results;
}

function parseWebsitePage(html: string): SocialLinkData[] {
  const results: SocialLinkData[] = [];

  for (const rowContent of tableRows(html)) {
    const anId = extractAnId(rowContent);
    if (!anId) continue;

    const websiteRegex = /<li>\s*<a\s+href="([^"]+)"/gi;
    let websiteMatch: RegExpExecArray | null;

    while ((websiteMatch = websiteRegex.exec(rowContent)) !== null) {
      const url = normalizeUrl(websiteMatch[1]);
      if (url) {
        results.push({ anId, platform: 'personal_website', url });
      }
    }
  }

  return results;
}

async function fetchPage(
  url: string,
  label: string,
  fetchFn: typeof fetch,
): Promise<string> {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`AN ${label}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Télécharge les deux listes en parallèle et renvoie tous les liens
 * (réseaux sociaux puis sites personnels). Lève si l'une des pages échoue.
 */
export async function fetchSocialLinks(
  fetchFn: typeof fetch = fetch,
): Promise<SocialLinkData[]> {
  const [socialHtml, websiteHtml] = await Promise.all([
    fetchPage(SOCIAL_URL, 'réseaux sociaux', fetchFn),
    fetchPage(WEBSITE_URL, 'sites internet', fetchFn),
  ]);

  return [...parseSocialPage(socialHtml), ...parseWebsitePage(websiteHtml)];
}
