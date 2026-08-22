import { z } from 'zod/v4';

const CommitteeItemSchema = z.object({
  name: z.string(),
  type: z.enum([
    'standing_committee',
    'special_committee',
    'delegation',
    'study_group',
    'friendship_group',
  ]),
  start_date: z.string(),
  end_date: z.string().optional(),
});

const DeputeCommitteesSchema = z.object({
  id_an: z.string(),
  committees: z.array(CommitteeItemSchema),
});

const CommitteesResponseSchema = z.object({
  deputes: z.array(DeputeCommitteesSchema),
});

export type CommitteeItem = z.infer<typeof CommitteeItemSchema>;
export type DeputeCommittees = z.infer<typeof DeputeCommitteesSchema>;

export const BASE_URL = 'https://data.assemblee-nationale.fr';

export async function fetchCommittees(
  fetchFn: typeof fetch = fetch,
): Promise<DeputeCommittees[]> {
  const url = `${BASE_URL}/api/commissions/json`;
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(
      `AN commissions API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const parsed = CommitteesResponseSchema.parse(data);
  return parsed.deputes;
}

export { CommitteeItemSchema, CommitteesResponseSchema };
