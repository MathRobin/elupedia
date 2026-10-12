/**
 * Résultats électoraux individuels (par identifiant AN) depuis data.gouv.fr.
 *
 * Source : `GET {BASE_URL}/api/elections/resultats/json`, réponse JSON
 * `{ results: ElectionResult[] }` validée par ElectionsResponseSchema
 * (../schemas.ts). Chaque résultat porte id_an, type et date d'élection,
 * tour, score en % et nombre d'adversaires.
 *
 * Piège : le parsing Zod est strict (`parse`) : une réponse inattendue lève.
 *
 * Appelé par upsert/electoral-results.ts.
 */
import {
  ElectionResultSchema,
  ElectionsResponseSchema,
  type ElectionResult,
} from '../schemas.js';

export { ElectionResultSchema, type ElectionResult };

export const BASE_URL = 'https://www.data.gouv.fr';

/** Télécharge et valide la liste des résultats. Lève sur erreur HTTP. */
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

  const payload = await response.json();
  const parsed = ElectionsResponseSchema.parse(payload);
  return parsed.results;
}
