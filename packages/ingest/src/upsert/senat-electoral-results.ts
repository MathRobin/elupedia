import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, electoralResults } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { SenatElectionResult } from '../sources/senat-elections.js';
import { logger } from '../logger.js';

export async function upsertSenatElectoralResults(
  db: NeonHttpDatabase,
  items: SenatElectionResult[],
) {
  const summary = { created: 0, updated: 0, skipped: 0 };

  const allOfficials = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials);
  const officialByName = new Map<string, string>();
  for (const o of allOfficials) {
    officialByName.set(
      `${o.lastName.toUpperCase()}|${o.firstName.toUpperCase()}`,
      o.id,
    );
  }

  const allResults = await db.select().from(electoralResults);
  const existingByKey = new Map<string, typeof electoralResults.$inferSelect>();
  for (const r of allResults) {
    existingByKey.set(`${r.officialId}|${r.electionDate}|${r.round}`, r);
  }

  const newRows: (typeof electoralResults.$inferInsert)[] = [];

  for (const item of items) {
    const officialId = officialByName.get(
      `${item.nom.toUpperCase()}|${item.prenom.toUpperCase()}`,
    );

    if (!officialId) {
      summary.skipped++;
      continue;
    }

    const existing = existingByKey.get(
      `${officialId}|${item.electionDate}|${item.round}`,
    );

    if (!existing) {
      newRows.push({
        officialId,
        electionType: 'sénatoriales',
        electionDate: item.electionDate,
        round: item.round,
        scorePercent: item.scorePercent,
        opponentCount: item.opponentCount,
      });
      summary.created++;
    } else if (
      existing.scorePercent !== item.scorePercent ||
      existing.opponentCount !== item.opponentCount
    ) {
      await db
        .update(electoralResults)
        .set({
          scorePercent: item.scorePercent,
          opponentCount: item.opponentCount,
          updatedAt: new Date(),
        })
        .where(eq(electoralResults.id, existing.id));
      summary.updated++;
    }
  }

  if (newRows.length > 0) {
    await db.insert(electoralResults).values(newRows);
  }

  if (summary.skipped > 0) {
    logger.warn(
      `Senate electoral results: ${summary.skipped} candidates not matched`,
    );
  }

  logger.info(
    `Senate electoral results: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`,
  );
  return summary;
}
