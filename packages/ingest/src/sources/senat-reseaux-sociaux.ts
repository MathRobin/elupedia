import { logger } from '../logger.js';

const SENATEURS_API = 'https://www.senat.fr/api-senat/senateurs.json';
const SENAT_BASE = 'https://www.senat.fr';
const SCRAPE_DELAY_MS = 2000;

export type SenatLinkPlatform = 'twitter' | 'facebook' | 'personal_website';

export interface SenatSocialLinkData {
  matricule: string;
  platform: SenatLinkPlatform;
  url: string;
}

interface ApiSenateur {
  matricule: string;
  url?: string;
  twitter?: string;
  facebook?: string;
}

function normalizeTwitter(handle: string): string {
  const clean = handle.replace(/^@/, '').trim();
  if (!clean) return '';
  return `https://twitter.com/${clean}`;
}

function normalizeFacebook(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http')) return trimmed;
  return `https://www.facebook.com/${trimmed}`;
}

function parseProfilePage(html: string): string | undefined {
  const sitePersoRe = /href="(https?:\/\/[^"]+)"[^>]*>\s*(?:Sur )?Site perso/i;
  const match = sitePersoRe.exec(html);
  return match?.[1];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchSenatSocialLinks(
  fetchFn: typeof fetch = fetch,
): Promise<SenatSocialLinkData[]> {
  const res = await fetchFn(SENATEURS_API);
  if (!res.ok) {
    throw new Error(
      `Sénat API senateurs error: ${res.status} ${res.statusText}`,
    );
  }

  const senateurs = (await res.json()) as ApiSenateur[];
  const results: SenatSocialLinkData[] = [];

  for (const s of senateurs) {
    if (s.twitter) {
      const url = normalizeTwitter(s.twitter);
      if (url)
        results.push({ matricule: s.matricule, platform: 'twitter', url });
    }
    if (s.facebook) {
      const url = normalizeFacebook(s.facebook);
      if (url)
        results.push({ matricule: s.matricule, platform: 'facebook', url });
    }
  }

  logger.info(
    `Sénat réseaux sociaux (API): ${results.length} liens pour ${senateurs.length} sénateurs`,
  );

  const activeWithUrl = senateurs.filter((s) => s.url);
  let scraped = 0;

  for (const s of activeWithUrl) {
    try {
      const pageRes = await fetchFn(`${SENAT_BASE}${s.url}`);
      if (!pageRes.ok) continue;

      const html = await pageRes.text();
      const sitePerso = parseProfilePage(html);
      if (sitePerso) {
        results.push({
          matricule: s.matricule,
          platform: 'personal_website',
          url: sitePerso,
        });
        scraped++;
      }
    } catch {
      logger.warn(`  Scrape failed for ${s.url}`);
    }

    await sleep(SCRAPE_DELAY_MS);
  }

  logger.info(
    `Sénat sites perso: ${scraped} trouvés sur ${activeWithUrl.length} fiches`,
  );
  return results;
}
