/**
 * Recherche de fact-checks via l'API Google Fact Check Tools.
 *
 * Source : `claims:search` (v1alpha1), JSON paginé par `nextPageToken`.
 * Nécessite une clé d'API Google. Chaque « claim » peut avoir plusieurs
 * « claimReview » (un par média vérificateur) : on émet un résultat par
 * review.
 *
 * Pièges :
 * - `pageSize` est plafonné à 10 par l'API (MAX_PAGE_SIZE).
 * - Un 429 (quota) arrête la pagination en silence (warn) au lieu de lever,
 *   pour ne pas interrompre un lot d'élus.
 * - Utilise le `fetch` global (pas d'injection).
 *
 * Appelé par run-factchecks.ts via upsert/fact-checks.ts.
 */
import { logger } from '../logger.js';

const API_BASE = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';

/** Taille de page maximale acceptée par l'API. */
const MAX_PAGE_SIZE = 10;
const DEFAULT_LANGUAGE_CODE = 'fr';
const DEFAULT_MAX_RESULTS = 20;

export interface FactCheckResult {
  claimReviewed: string;
  reviewUrl: string;
  reviewerName: string;
  reviewerUrl: string | null;
  rating: string | null;
  datePublished: string | null;
  languageCode: string;
}

interface ApiClaimReview {
  publisher?: { name?: string; site?: string };
  url?: string;
  title?: string;
  textualRating?: string;
  languageCode?: string;
  reviewDate?: string;
}

interface ApiClaim {
  text?: string;
  claimReview?: ApiClaimReview[];
}

interface ApiResponse {
  claims?: ApiClaim[];
  nextPageToken?: string;
}

/**
 * Recherche les fact-checks correspondant à `query` (typiquement le nom d'un
 * élu) et renvoie jusqu'à `maxResults` reviews. Lève sur erreur HTTP autre
 * qu'un 429.
 */
export async function searchFactChecks(
  query: string,
  apiKey: string,
  opts: { languageCode?: string; maxResults?: number } = {},
): Promise<FactCheckResult[]> {
  const {
    languageCode = DEFAULT_LANGUAGE_CODE,
    maxResults = DEFAULT_MAX_RESULTS,
  } = opts;
  const results: FactCheckResult[] = [];
  let pageToken: string | undefined;

  while (results.length < maxResults) {
    const params = new URLSearchParams({
      query,
      languageCode,
      pageSize: String(Math.min(maxResults - results.length, MAX_PAGE_SIZE)),
      key: apiKey,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetch(`${API_BASE}?${params}`);
    if (!response.ok) {
      if (response.status === 429) {
        logger.warn('  Google Fact Check API rate limited, stopping');
        break;
      }
      throw new Error(
        `Fact Check API ${response.status}: ${await response.text()}`,
      );
    }

    const payload: ApiResponse = await response.json();
    if (!payload.claims?.length) break;

    for (const claim of payload.claims) {
      if (!claim.text || !claim.claimReview?.length) continue;

      for (const review of claim.claimReview) {
        if (!review.url || !review.publisher?.name) continue;

        results.push({
          claimReviewed: claim.text,
          reviewUrl: review.url,
          reviewerName: review.publisher.name,
          reviewerUrl: review.publisher.site ?? null,
          rating: review.textualRating ?? null,
          // reviewDate est un timestamp ISO : on ne garde que la date.
          datePublished: review.reviewDate?.slice(0, 10) ?? null,
          languageCode: review.languageCode ?? languageCode,
        });
      }
    }

    pageToken = payload.nextPageToken;
    if (!pageToken) break;
  }

  return results;
}
