/**
 * Réseaux sociaux d'un député, lus sur sa fiche HTML officielle.
 *
 * Source : page `https://www.assemblee-nationale.fr/dyn/deputes/{PAxxxx}`
 * (scraping, pas d'API). Les liens sociaux y sont des `<a href="…"
 * data-tipsy="Voir la page Twitter">` ; le mot après « Voir la page » donne
 * la plateforme.
 *
 * Complément de an-reseaux-sociaux.ts (listes globales, sans Instagram) :
 * utilisé fiche par fiche pour récupérer notamment les comptes Instagram.
 *
 * Pièges : une erreur HTTP renvoie [] sans lever (la fiche peut ne pas
 * exister pour un ancien député). Le marquage HTML peut changer sans préavis.
 *
 * Appelé par run-social-links.ts.
 */
import type { SocialLinkData, AnLinkPlatform } from './an-reseaux-sociaux.js';

/** Libellé (en minuscules) après « Voir la page » → plateforme. */
const PLATFORM_MAP: Record<string, AnLinkPlatform> = {
  twitter: 'twitter',
  facebook: 'facebook',
  instagram: 'instagram',
};

const BASE_URL = 'https://www.assemblee-nationale.fr/dyn/deputes';

const USER_AGENT = 'Elupedia/1.0 (https://www.elupedia.fr)';

/**
 * Récupère les liens Twitter/Facebook/Instagram de la fiche d'un député.
 * Renvoie [] si la page est inaccessible.
 */
export async function scrapeAnFicheSociale(
  anId: string,
  fetchFn: typeof fetch = fetch,
): Promise<SocialLinkData[]> {
  const url = `${BASE_URL}/${anId}`;
  const response = await fetchFn(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) return [];

  const html = await response.text();
  const results: SocialLinkData[] = [];

  // Capture (1) l'URL du lien, (2) le nom de la plateforme dans l'infobulle.
  const socialLinkRegex =
    /<a\s+href="(https?:\/\/[^"]+)"[^>]*data-tipsy="Voir la page (\w+)/gi;
  let match: RegExpExecArray | null;

  while ((match = socialLinkRegex.exec(html)) !== null) {
    const rawUrl = match[1].trim();
    const platformKey = match[2].toLowerCase();
    const platform = PLATFORM_MAP[platformKey];
    if (platform && rawUrl) {
      results.push({ anId, platform, url: rawUrl });
    }
  }

  return results;
}
