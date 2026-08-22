import { z } from 'zod/v4';

const AddressSchema = z.object({
  id_an: z.string(),
  type: z.enum(['constituency_office', 'assembly_office']),
  street: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});

const AddressesResponseSchema = z.object({
  deputes: z.array(AddressSchema),
});

export type AddressData = z.infer<typeof AddressSchema>;

export const BASE_URL = 'https://data.assemblee-nationale.fr';

export async function fetchAddresses(
  fetchFn: typeof fetch = fetch,
): Promise<AddressData[]> {
  const url = `${BASE_URL}/api/adresses/json`;
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(
      `AN adresses API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const parsed = AddressesResponseSchema.parse(data);
  return parsed.deputes;
}

export { AddressSchema, AddressesResponseSchema };
