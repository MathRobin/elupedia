import { buildHatvpSlug } from '@elupedia/shared';

import { logger } from '../logger.js';

export type HatvpDeclarationStatus = 'pending' | 'none' | null;

export async function checkHatvpStatus(
  firstName: string,
  lastName: string,
  fetchFn: typeof fetch = fetch,
): Promise<HatvpDeclarationStatus> {
  const slug = buildHatvpSlug(firstName, lastName);
  const url = `https://www.hatvp.fr/fiche-nominative/?declarant=${slug}`;

  const response = await fetchFn(url, {
    headers: {
      'User-Agent': 'Elupedia/1.0 (https://www.elupedia.fr)',
    },
  });

  if (!response.ok) {
    logger.warn(
      `HATVP status check failed for ${firstName} ${lastName}: ${response.status}`,
    );
    return null;
  }

  const html = await response.text();

  if (
    html.includes('publication à venir') ||
    html.includes('publication à venir')
  ) {
    return 'pending';
  }

  if (
    html.includes('Aucune déclaration') ||
    html.includes('aucune déclaration')
  ) {
    return 'none';
  }

  return null;
}
