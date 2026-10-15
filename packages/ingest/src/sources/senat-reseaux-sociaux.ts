/**
 * Liens Twitter, Facebook et site personnel des sénateurs.
 *
 * Deux sources combinées :
 *   1. l'API JSON senat.fr/api-senat/senateurs.json (un objet par sénateur,
 *      champs facultatifs `twitter` — pseudo avec ou sans « @ — et
 *      `facebook` — identifiant numérique, pseudo ou URL complète), normalisés
 *      en URL ;
 *   2. la fiche HTML de chaque sénateur (`url` relative de l'API), scrapée par
 *      regex pour le lien « Site perso », absent de l'API.
 *
 * Le scraping est séquentiel avec SCRAPE_DELAY_MS entre deux fiches (~350
 * sénateurs → une dizaine de minutes). Une fiche en échec est loguée et
 * sautée, seule l'API en erreur fait échouer l'appel.
 *
 * Appelé par run-senat.ts, consommé par upsert/senat-social-links.ts.
 */
import { logger } from '../logger.js';

const SENATEURS_API = 'https://www.senat.fr/api-senat/senateurs.json';
const SENAT_BASE = 'https://www.senat.fr';
/** Pause entre deux fiches scrapées, par courtoisie envers senat.fr. */
const SCRAPE_DELAY_MS = 2000;

export type SenatLinkPlatform = 'twitter' | 'facebook' | 'personal_website';

export interface SenatSocialLinkData {
  matricule: string;
  platform: SenatLinkPlatform;
  url: string;
}

interface ApiSenateur {
  matricule: string;
  /** Chemin relatif de la fiche senat.fr (ex. /senateur/dantec_ronan11065p.html). */
  url?: string;
  twitter?: string;
  facebook?: string;
}

/** Pseudo (avec ou sans « @ ») → URL de profil ; '' si vide. */
function normalizeTwitter(handle: string): string {
  const clean = handle.replace(/^@/, '').trim();
  if (!clean) return '';
  return `https://twitter.com/${clean}`;
}

/** Identifiant, pseudo ou URL complète → URL de profil ; '' si vide. */
function normalizeFacebook(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http')) return trimmed;
  return `https://www.facebook.com/${trimmed}`;
}

/** Extrait l'URL du lien « Site perso » (ou « Sur Site perso ») d'une fiche sénateur. */
function parseProfilePage(html: string): string | undefined {
  const sitePersoRe = /href="(https?:\/\/[^"]+)"[^>]*>\s*(?:Sur )?Site perso/i;
  const match = sitePersoRe.exec(html);
  return match?.[1];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lit l'API puis scrape chaque fiche ayant une `url` (un GET par sénateur,
 * séquentiel, avec pause). Retourne un lien par (matricule, plateforme)
 * trouvé. Lève une erreur si l'API ne répond pas en 2xx.
 */
export async function fetchSenatSocialLinks(
  fetchFn: typeof fetch = fetch,
): Promise<SenatSocialLinkData[]> {
  const apiResponse = await fetchFn(SENATEURS_API);
  if (!apiResponse.ok) {
    throw new Error(
      `Sénat API senateurs error: ${apiResponse.status} ${apiResponse.statusText}`,
    );
  }

  const senateurs = (await apiResponse.json()) as ApiSenateur[];
  const results: SenatSocialLinkData[] = [];

  for (const senateur of senateurs) {
    if (senateur.twitter) {
      const url = normalizeTwitter(senateur.twitter);
      if (url)
        results.push({
          matricule: senateur.matricule,
          platform: 'twitter',
          url,
        });
    }
    if (senateur.facebook) {
      const url = normalizeFacebook(senateur.facebook);
      if (url)
        results.push({
          matricule: senateur.matricule,
          platform: 'facebook',
          url,
        });
    }
  }

  logger.info(
    `Sénat réseaux sociaux (API): ${results.length} liens pour ${senateurs.length} sénateurs`,
  );

  const withProfilePage = senateurs.filter((senateur) => senateur.url);
  let scraped = 0;

  for (const senateur of withProfilePage) {
    try {
      const pageResponse = await fetchFn(`${SENAT_BASE}${senateur.url}`);
      if (!pageResponse.ok) continue;

      const html = await pageResponse.text();
      const sitePerso = parseProfilePage(html);
      if (sitePerso) {
        results.push({
          matricule: senateur.matricule,
          platform: 'personal_website',
          url: sitePerso,
        });
        scraped++;
      }
    } catch {
      logger.warn(`  Scrape failed for ${senateur.url}`);
    }

    await sleep(SCRAPE_DELAY_MS);
  }

  logger.info(
    `Sénat sites perso: ${scraped} trouvés sur ${withProfilePage.length} fiches`,
  );
  return results;
}
