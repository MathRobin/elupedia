import { z } from 'zod/v4';

const CollaborateurSchema = z.object({
  prenom: z.string(),
  nom: z.string(),
  id_an: z.string(),
});

const CollaborateursDeputeSchema = z.object({
  id_an: z.string(),
  collaborateurs: z.array(CollaborateurSchema),
});

const CollaborateursResponseSchema = z.object({
  deputes: z.array(CollaborateursDeputeSchema),
});

export type Collaborateur = z.infer<typeof CollaborateurSchema>;
export type CollaborateursDepute = z.infer<typeof CollaborateursDeputeSchema>;
export type CollaborateursResponse = z.infer<
  typeof CollaborateursResponseSchema
>;

export const BASE_URL = 'https://data.assemblee-nationale.fr';

export async function fetchCollaborateurs(
  fetchFn: typeof fetch = fetch,
): Promise<CollaborateursDepute[]> {
  const url = `${BASE_URL}/api/collaborateurs/json`;
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(
      `AN collaborateurs API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const parsed = CollaborateursResponseSchema.parse(data);
  return parsed.deputes;
}

export { CollaborateurSchema, CollaborateursResponseSchema };
