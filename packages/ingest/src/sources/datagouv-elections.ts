import { z } from 'zod/v4';

const ElectionResultSchema = z.object({
  id_an: z.string(),
  election_type: z.string(),
  election_date: z.string(),
  round: z.number().int(),
  score_percent: z.number(),
  opponent_count: z.number().int(),
});

const ElectionsResponseSchema = z.object({
  results: z.array(ElectionResultSchema),
});

export type ElectionResult = z.infer<typeof ElectionResultSchema>;

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

export { ElectionResultSchema, ElectionsResponseSchema };
