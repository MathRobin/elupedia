import { z } from 'zod/v4';

const AffiliationSchema = z.object({
  slug: z.string(),
  id_an: z.string().optional(),
  groupe_sigle: z.string().optional(),
  parti_ratt_financier: z.string().optional(),
});

const AffiliationsResponseSchema = z.object({
  deputes: z.array(z.object({ depute: AffiliationSchema })),
});

export type AffiliationData = z.infer<typeof AffiliationSchema>;

export const BASE_URL = 'https://www.nosdeputes.fr';

export async function fetchAffiliations(
  fetchFn: typeof fetch = fetch,
): Promise<AffiliationData[]> {
  const url = `${BASE_URL}/deputes/json`;
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(
      `NosDéputés affiliations API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const parsed = AffiliationsResponseSchema.parse(data);
  return parsed.deputes.map((d) => d.depute);
}

export { AffiliationSchema, AffiliationsResponseSchema };
