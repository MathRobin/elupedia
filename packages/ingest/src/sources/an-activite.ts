import { z } from 'zod/v4';

const ActivityItemSchema = z.object({
  type: z.enum(['written_question', 'oral_question', 'amendment', 'report']),
  title: z.string(),
  date: z.string(),
  status: z.enum(['adopted', 'rejected', 'withdrawn']).optional(),
});

const DeputeActivitySchema = z.object({
  id_an: z.string(),
  activities: z.array(ActivityItemSchema),
});

const ActivityResponseSchema = z.object({
  deputes: z.array(DeputeActivitySchema),
});

export type ActivityItem = z.infer<typeof ActivityItemSchema>;
export type DeputeActivity = z.infer<typeof DeputeActivitySchema>;

export const BASE_URL = 'https://data.assemblee-nationale.fr';

export async function fetchActivities(
  fetchFn: typeof fetch = fetch,
): Promise<DeputeActivity[]> {
  const url = `${BASE_URL}/api/activite-parlementaire/json`;
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(
      `AN activité API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const parsed = ActivityResponseSchema.parse(data);
  return parsed.deputes;
}

export { ActivityItemSchema, ActivityResponseSchema };
