import type { SocialLinkData, AnLinkPlatform } from './an-reseaux-sociaux.js';

const PLATFORM_MAP: Record<string, AnLinkPlatform> = {
  twitter: 'twitter',
  facebook: 'facebook',
  instagram: 'instagram',
};

const BASE_URL = 'https://www.assemblee-nationale.fr/dyn/deputes';

export async function scrapeAnFicheSociale(
  anId: string,
  fetchFn: typeof fetch = fetch,
): Promise<SocialLinkData[]> {
  const url = `${BASE_URL}/${anId}`;
  const res = await fetchFn(url, {
    headers: { 'User-Agent': 'Elupedia/1.0 (https://www.elupedia.fr)' },
  });

  if (!res.ok) return [];

  const html = await res.text();
  const results: SocialLinkData[] = [];

  const re =
    /<a\s+href="(https?:\/\/[^"]+)"[^>]*data-tipsy="Voir la page (\w+)/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    const rawUrl = match[1].trim();
    const platformKey = match[2].toLowerCase();
    const platform = PLATFORM_MAP[platformKey];
    if (platform && rawUrl) {
      results.push({ anId, platform, url: rawUrl });
    }
  }

  return results;
}
