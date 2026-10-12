/**
 * Upsert des scores individuels des sénateurs à leur élection (open data
 * Sénat, `sources/senat-elections.ts`), appelé par `run-senat.ts`
 * (`ingest:senat`).
 *
 * Table écrite : `electoral_results` (type `sénatoriales`).
 * Clés de rapprochement :
 * - official : NOM + PRÉNOM en majuscules, sans date de naissance (la source
 *   n'en a pas) — un homonyme strict serait confondu, les non-rattachés sont
 *   comptés en `skipped` ;
 * - résultat : official + date d'élection + tour.
 *
 * Idempotent : UPDATE seulement si le score ou le nombre d'adversaires change.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, electoralResults } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { SenatElectionResult } from '../sources/senat-elections.js';
import { logger } from '../logger.js';

const ELECTION_TYPE = 'sénatoriales';

/**
 * Upsert des résultats électoraux sénatoriaux. Écrit dans `electoral_results`.
 * Retourne le nombre de lignes créées, mises à jour et ignorées.
 */
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
  for (const official of allOfficials) {
    officialByName.set(
      `${official.lastName.toUpperCase()}|${official.firstName.toUpperCase()}`,
      official.id,
    );
  }

  const allResults = await db.select().from(electoralResults);
  const existingByKey = new Map<string, typeof electoralResults.$inferSelect>();
  for (const result of allResults) {
    existingByKey.set(
      `${result.officialId}|${result.electionDate}|${result.round}`,
      result,
    );
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
        electionType: ELECTION_TYPE,
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
