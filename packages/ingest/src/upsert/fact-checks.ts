import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { factChecks } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { FactCheckResult } from '../sources/google-factcheck.js';

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
