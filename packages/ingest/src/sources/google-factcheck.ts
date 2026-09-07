import { logger } from '../logger.js';

const API_BASE = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';

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

export async function searchFactChecks(
  query: string,
  apiKey: string,
  opts: { languageCode?: string; maxResults?: number } = {},
): Promise<FactCheckResult[]> {
  const { languageCode = 'fr', maxResults = 20 } = opts;
  const results: FactCheckResult[] = [];
  let pageToken: string | undefined;

  while (results.length < maxResults) {
    const params = new URLSearchParams({
      query,
      languageCode,
      pageSize: String(Math.min(maxResults - results.length, 10)),
      key: apiKey,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${API_BASE}?${params}`);
    if (!res.ok) {
      if (res.status === 429) {
        logger.warn('  Google Fact Check API rate limited, stopping');
        break;
      }
      throw new Error(`Fact Check API ${res.status}: ${await res.text()}`);
    }

    const data: ApiResponse = await res.json();
    if (!data.claims?.length) break;

    for (const claim of data.claims) {
      if (!claim.text || !claim.claimReview?.length) continue;

      for (const review of claim.claimReview) {
        if (!review.url || !review.publisher?.name) continue;

        results.push({
          claimReviewed: claim.text,
          reviewUrl: review.url,
          reviewerName: review.publisher.name,
          reviewerUrl: review.publisher.site ?? null,
          rating: review.textualRating ?? null,
          datePublished: review.reviewDate?.slice(0, 10) ?? null,
          languageCode: review.languageCode ?? languageCode,
        });
      }
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return results;
}
