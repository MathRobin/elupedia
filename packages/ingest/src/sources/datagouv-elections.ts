import {
  ElectionResultSchema,
  ElectionsResponseSchema,
  type ElectionResult,
} from '../schemas.js';

export { ElectionResultSchema, type ElectionResult };

export const BASE_URL = 'https://www.data.gouv.fr';

export async function fetchElectionResults(
  fetchFn: typeof fetch = fetch,
): Promise<ElectionResult[]> {
  const url = `${BASE_URL}/api/elections/resultats/json`;
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(
      `data.gouv.fr elections API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const parsed = ElectionsResponseSchema.parse(data);
  return parsed.results;
}
