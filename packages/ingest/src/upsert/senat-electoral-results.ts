import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, electoralResults } from '@elupedia/shared';
import { eq, and, sql } from 'drizzle-orm';
import type { SenatElectionResult } from '../sources/senat-elections.js';
import { logger } from '../logger.js';

export async function upsertSenatElectoralResults(
  db: NeonHttpDatabase,
  items: SenatElectionResult[],
) {
  const summary = { created: 0, updated: 0, skipped: 0 };

  for (const item of items) {
    const matches = await db
      .select({ id: officials.id })
      .from(officials)
      .where(
        and(
          eq(sql`UPPER(${officials.lastName})`, item.nom.toUpperCase()),
          eq(
            sql`UPPER(${officials.firstName})`,
            item.prenom.toUpperCase(),
          ),
        ),
      )
      .limit(1);

    if (matches.length === 0) {
      summary.skipped++;
      continue;
    }

    const officialId = matches[0].id;

    const existing = await db
      .select()
      .from(electoralResults)
      .where(
        and(
          eq(electoralResults.officialId, officialId),
          eq(electoralResults.electionDate, item.electionDate),
          eq(electoralResults.round, item.round),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(electoralResults).values({
        officialId,
        electionType: 'sénatoriales',
        electionDate: item.electionDate,
        round: item.round,
        scorePercent: item.scorePercent,
        opponentCount: item.opponentCount,
      });
      summary.created++;
    } else {
      await db
        .update(electoralResults)
        .set({
          scorePercent: item.scorePercent,
          opponentCount: item.opponentCount,
        })
        .where(eq(electoralResults.id, existing[0].id));
      summary.updated++;
    }
  }

  if (summary.skipped > 0) {
    logger.warn(
      `Senate electoral results: ${summary.skipped} candidates not matched`,
    );
  }

  return summary;
}
