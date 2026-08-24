import {
  InterestItemSchema,
  HatvpResponseSchema,
  type InterestItem,
  type Declaration,
} from '../schemas.js';

export { InterestItemSchema, type InterestItem, type Declaration };

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
