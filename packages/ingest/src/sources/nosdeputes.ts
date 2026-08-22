import { z } from 'zod/v4';

const DeputeSchema = z.object({
  id: z.number(),
  nom: z.string(),
  prenom: z.string(),
  sexe: z.string(),
  date_naissance: z.string(),
  lieu_naissance: z.string().optional(),
  num_deptmt: z.string(),
  nom_circo: z.string(),
  num_circo: z.number(),
  mandat_debut: z.string(),
  mandat_fin: z.string().optional(),
  groupe_sigle: z.string().optional(),
  parti_ratt_financier: z.string().optional(),
  slug: z.string(),
  id_an: z.string().optional(),
  photo_url: z.string().optional(),
});

const DeputeWrapperSchema = z.object({
  depute: DeputeSchema,
});

const DeputesResponseSchema = z.object({
  deputes: z.array(DeputeWrapperSchema),
});

export type Depute = z.infer<typeof DeputeSchema>;
export type DeputesResponse = z.infer<typeof DeputesResponseSchema>;

export const BASE_URL = 'https://www.nosdeputes.fr';

export async function fetchDeputesGironde(
  fetchFn: typeof fetch = fetch,
): Promise<Depute[]> {
  const url = `${BASE_URL}/33/json`;
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(
      `NosDéputés API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const parsed = DeputesResponseSchema.parse(data);
  return parsed.deputes.map((d) => d.depute);
}

export { DeputeSchema, DeputesResponseSchema };
