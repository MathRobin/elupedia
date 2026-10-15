/**
 * Upsert du détail des demandes CADA déposées sur MaDaDa pour une commune
 * (titre, statut, dates). Données issues de `sources/madada-requests.ts`,
 * appelé par `main-madada.ts` (étape 2, une commune à la fois) après
 * `commune-transparency.ts`.
 *
 * Table écrite : `madada_requests`, clé primaire `madada_id`.
 * Idempotent : ON CONFLICT DO UPDATE ne réécrit que `status` et
 * `updated_at` ; le titre, l'URL et la commune de rattachement ne sont
 * jamais modifiés après création. `created_at`/`updated_at` sont ici les
 * dates MaDaDa de la demande, pas des timestamps techniques.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { madadaRequests } from '@elupedia/shared';
import { type MadadaRequest } from '../sources/madada-requests.js';

/**
 * Upsert en base des demandes d'une commune (écriture DB, une requête par
 * demande). Retourne les compteurs created / updated.
 */
export async function upsertMadadaRequests(
  db: NeonHttpDatabase,
  communeCode: string,
  requests: MadadaRequest[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const request of requests) {
    const result = await db
      .insert(madadaRequests)
      .values({
        madadaId: request.madadaId,
        communeCode,
        urlTitle: request.urlTitle,
        title: request.title,
        status: request.status,
        createdAt: new Date(request.createdAt),
        updatedAt: new Date(request.updatedAt),
      })
      .onConflictDoUpdate({
        target: madadaRequests.madadaId,
        set: {
          status: sql`excluded."status"`,
          updatedAt: sql`excluded."updated_at"`,
        },
      })
      .returning({ id: madadaRequests.madadaId });

    if (result.length > 0) {
      created++;
    } else {
      updated++;
    }
  }

  return { created, updated };
}
