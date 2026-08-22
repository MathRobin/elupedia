import { z } from 'zod/v4';

const InterestItemSchema = z.object({
  type: z.enum(['company_share', 'nonprofit_role']),
  entity_name: z.string(),
  role_description: z.string().optional(),
  declared_date: z.string(),
});

const DeclarationSchema = z.object({
  id_an: z.string(),
  interests: z.array(InterestItemSchema),
});

const HatvpResponseSchema = z.object({
  declarations: z.array(DeclarationSchema),
});

export type InterestItem = z.infer<typeof InterestItemSchema>;
export type Declaration = z.infer<typeof DeclarationSchema>;

export const BASE_URL = 'https://www.hatvp.fr/api';

export async function fetchDeclarations(
  fetchFn: typeof fetch = fetch,
): Promise<Declaration[]> {
  const url = `${BASE_URL}/declarations/interests/json`;
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(
      `HATVP API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const parsed = HatvpResponseSchema.parse(data);
  return parsed.declarations;
}

export { InterestItemSchema, HatvpResponseSchema };
