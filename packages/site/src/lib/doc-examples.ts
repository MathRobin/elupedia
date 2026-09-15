import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import { getDb } from './db.js';

/**
 * Élu servant d'exemple dans la documentation publique.
 *
 * Les slugs d'élus ne sont pas stables : ils changent avec les corrections
 * d'état civil et la résolution des homonymies. Les citer en dur a fini par
 * afficher une iframe et une image en 404 sur `/integrer` (#268). L'exemple est
 * donc choisi dans la base au moment du rendu.
 */
export interface DocExample {
  slug: string;
  fullName: string;
}

const FALLBACK: DocExample = {
  slug: 'exemple',
  fullName: 'Nom de l’élu',
};

let cached: DocExample | null = null;

export async function getDocExample(): Promise<DocExample> {
  if (cached) return cached;

  try {
    const [row] = await getDb()
      .select({
        slug: officials.slug,
        firstName: officials.firstName,
        lastName: officials.lastName,
      })
      .from(officials)
      .innerJoin(mandates, eq(mandates.officialId, officials.id))
      .where(
        and(
          eq(mandates.type, 'depute'),
          isNull(mandates.endDate),
          isNotNull(officials.slug),
          // Une photo existe : la carte oEmbed et l'image Open Graph montrées
          // en exemple sont alors représentatives du rendu réel.
          isNotNull(officials.photoUrl),
        ),
      )
      .orderBy(officials.lastName, officials.firstName)
      .limit(1);

    if (!row?.slug) return FALLBACK;

    cached = {
      slug: row.slug,
      fullName: `${row.firstName} ${row.lastName}`,
    };
    return cached;
  } catch {
    // La documentation doit se rendre même sans base accessible.
    return FALLBACK;
  }
}
