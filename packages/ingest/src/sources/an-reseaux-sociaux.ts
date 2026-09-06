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

function normalizeUrl(raw: string): string {
  return raw.trim().replace(/\s+/g, '');
}

function parseSocialPage(html: string): SocialLinkData[] {
  const results: SocialLinkData[] = [];
  const trRe = /<tr>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRe.exec(html)) !== null) {
    const trContent = trMatch[1];

    const ficheRe = /href="[^"]*\/fiche\/OMC_(PA\d+)"/;
    const ficheMatch = ficheRe.exec(trContent);
    if (!ficheMatch) continue;
    const anId = ficheMatch[1];

    const linkRe = /<a\s+class="(facebook|twitter)"\s+href="([^"]+)"/gi;
    let linkMatch: RegExpExecArray | null;

    while ((linkMatch = linkRe.exec(trContent)) !== null) {
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
  const trRe = /<tr>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRe.exec(html)) !== null) {
    const trContent = trMatch[1];

    const ficheRe = /href="[^"]*\/fiche\/OMC_(PA\d+)"/;
    const ficheMatch = ficheRe.exec(trContent);
    if (!ficheMatch) continue;
    const anId = ficheMatch[1];

    const websiteRe = /<li>\s*<a\s+href="([^"]+)"/gi;
    let wsMatch: RegExpExecArray | null;

    while ((wsMatch = websiteRe.exec(trContent)) !== null) {
      const url = normalizeUrl(wsMatch[1]);
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

export async function fetchSocialLinks(
  fetchFn: typeof fetch = fetch,
): Promise<SocialLinkData[]> {
  const [socialHtml, websiteHtml] = await Promise.all([
    fetchPage(SOCIAL_URL, 'réseaux sociaux', fetchFn),
    fetchPage(WEBSITE_URL, 'sites internet', fetchFn),
  ]);

  return [...parseSocialPage(socialHtml), ...parseWebsitePage(websiteHtml)];
}
