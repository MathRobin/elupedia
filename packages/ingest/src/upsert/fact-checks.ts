/**
 * Upsert des vérifications de faits (Google Fact Check Tools API,
 * `sources/google-factcheck.ts`) concernant un élu donné. Appelé par
 * `run-factchecks.ts`, une fois par official recherché.
 *
 * Table écrite : `fact_checks`.
 * Clé de rapprochement : (official_id, review_url) — l'URL de l'article de
 * vérification identifie la review.
 * Idempotent : une ligne existante n'est réécrite que si la note (`rating`)
 * a changé ; les autres champs (claim, reviewer, date, langue) ne sont
 * jamais mis à jour après création.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { factChecks } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { FactCheckResult } from '../sources/google-factcheck.js';

/**
 * Insère les reviews inconnues et met à jour la note des existantes
 * (écriture DB). Retourne les compteurs created / updated.
 */
export async function upsertFactChecks(
  db: NeonHttpDatabase,
  officialId: string,
  items: FactCheckResult[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const item of items) {
    const existing = await db
      .select({ id: factChecks.id, rating: factChecks.rating })
      .from(factChecks)
      .where(
        and(
          eq(factChecks.officialId, officialId),
          eq(factChecks.reviewUrl, item.reviewUrl),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(factChecks).values({
        officialId,
        claimReviewed: item.claimReviewed,
        reviewUrl: item.reviewUrl,
        reviewerName: item.reviewerName,
        reviewerUrl: item.reviewerUrl,
        rating: item.rating,
        datePublished: item.datePublished,
        languageCode: item.languageCode,
      });
      created++;
    } else if (existing[0].rating !== item.rating) {
      await db
        .update(factChecks)
        .set({
          rating: item.rating,
          updatedAt: new Date(),
        })
        .where(eq(factChecks.id, existing[0].id));
      updated++;
    }
  }

  return { created, updated };
}
