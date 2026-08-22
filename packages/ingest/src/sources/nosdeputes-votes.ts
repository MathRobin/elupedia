import { z } from 'zod/v4';

const VoteDetailSchema = z.object({
  scrutin_id: z.number(),
  scrutin_titre: z.string(),
  scrutin_date: z.string(),
  scrutin_type: z.string().optional(),
  position: z.string(),
});

const VotesResponseSchema = z.object({
  votes: z.array(z.object({ vote: VoteDetailSchema })),
});

export type VoteDetail = z.infer<typeof VoteDetailSchema>;
export type VotesResponse = z.infer<typeof VotesResponseSchema>;

export const BASE_URL = 'https://www.nosdeputes.fr';

export async function fetchVotesForDepute(
  slug: string,
  fetchFn: typeof fetch = fetch,
): Promise<VoteDetail[]> {
  const url = `${BASE_URL}/${slug}/votes/json`;
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(
      `NosDéputés votes API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const parsed = VotesResponseSchema.parse(data);
  return parsed.votes.map((v) => v.vote);
}

export { VoteDetailSchema, VotesResponseSchema };
