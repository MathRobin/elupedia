const USER_AGENT = 'ElupediaBot/1.0 (+https://elupedia.fr/mentions-legales)';

type SocialPlatform = 'instagram' | 'tiktok' | 'youtube';

export interface DetectedLink {
  platform: SocialPlatform;
  url: string;
}

function domainToPlatform(hostname: string): SocialPlatform | null {
  if (hostname.endsWith('instagram.com')) return 'instagram';
  if (hostname.endsWith('tiktok.com')) return 'tiktok';
  if (hostname.endsWith('youtube.com')) return 'youtube';
  return null;
}

export async function checkRobotsTxt(
  siteUrl: string,
  fetchFn = globalThis.fetch,
): Promise<boolean> {
  try {
    const origin = new URL(siteUrl).origin;
    const res = await fetchFn(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return true;
    const text = await res.text();
    let inOurBlock = false;
    let inWildcardBlock = false;
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim().split('#')[0].trim();
      if (!line) continue;
      const [directive, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      if (directive.toLowerCase() === 'user-agent') {
        const agent = value.toLowerCase();
        inOurBlock = agent === 'elupediabot';
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
      // invalid URL, skip
    }
  }
  return results;
}

export async function scrapePersonalWebsite(
  siteUrl: string,
  fetchFn = globalThis.fetch,
): Promise<DetectedLink[]> {
  const allowed = await checkRobotsTxt(siteUrl, fetchFn);
  if (!allowed) return [];

  const res = await fetchFn(siteUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];

  const html = await res.text();
  return extractSocialLinks(html, siteUrl);
}
