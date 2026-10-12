/**
 * Statut de publication de la déclaration d'un élu sur le site de la HATVP.
 *
 * Source : page « fiche nominative » hatvp.fr (HTML, scraping) construite à
 * partir du slug prénom-nom partagé (buildHatvpSlug). Complète hatvp.ts
 * (flux XML des déclarations publiées) pour les élus sans déclaration
 * publiée : la page indique si une publication est « à venir » ou s'il n'y
 * a « aucune déclaration ».
 *
 * Retour : 'pending' (publication à venir), 'none' (aucune déclaration),
 * null (page inaccessible ou aucun des deux libellés — en pratique, une
 * déclaration déjà publiée ou un slug inconnu).
 *
 * Piège : la page utilise parfois des espaces insécables autour du « à » :
 * les deux variantes sont testées.
 *
 * Appelé par run-hatvp-status.ts / run.ts via upsert/hatvp-status.ts.
 */
import { buildHatvpSlug } from '@elupedia/shared';

import { logger } from '../logger.js';

export type HatvpDeclarationStatus = 'pending' | 'none' | null;

const USER_AGENT = 'Elupedia/1.0 (https://www.elupedia.fr)';

/**
 * Lit la fiche nominative HATVP d'un élu et en déduit le statut de sa
 * déclaration. Ne lève jamais sur erreur HTTP (warn + null).
 */
export async function checkHatvpStatus(
  firstName: string,
  lastName: string,
  fetchFn: typeof fetch = fetch,
): Promise<HatvpDeclarationStatus> {
  const slug = buildHatvpSlug(firstName, lastName);
  const url = `https://www.hatvp.fr/fiche-nominative/?declarant=${slug}`;

  const response = await fetchFn(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    logger.warn(
      `HATVP status check failed for ${firstName} ${lastName}: ${response.status}`,
    );
    return null;
  }

  const html = await response.text();

  // Seconde variante : espaces insécables (U+00A0) autour du « à ».
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
