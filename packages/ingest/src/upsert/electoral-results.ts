/**
 * Upsert des résultats électoraux individuels des députés (score et nombre
 * d'adversaires par tour) issus de data.gouv.fr
 * (`sources/datagouv-elections.ts`).
 *
 * Table écrite : `electoral_results` (+ `data_provenance`, une ligne par
 * résultat via writeProvenance).
 * Clé de rapprochement : (official_id, election_type, election_date, round).
 * L'official est retrouvé par `officials.an_id` ; les résultats sans
 * official connu sont ignorés.
 * Idempotent : une ligne existante est réécrite à chaque run (score et
 * nombre d'adversaires), sans comparaison préalable.
 * Piège : deux SELECT + une écriture par résultat (pas de cache) — acceptable
 * pour quelques centaines de lignes, à revoir si le volume grossit.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, electoralResults } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { ElectionResult } from '../sources/datagouv-elections.js';
import { writeProvenance } from './provenance.js';

const SOURCE_NAME = 'data.gouv.fr - Résultats électoraux';
const LEGAL_BASIS =
  'Résultats électoraux publiés (art. L311-1 CRPA, données publiques)';

/**
 * Insère ou réécrit chaque résultat et sa provenance (écriture DB).
 * Retourne les compteurs created / updated.
 */
export async function upsertElectoralResults(
  db: NeonHttpDatabase,
  results: ElectionResult[],
) {
  const summary = { created: 0, updated: 0 };

  for (const result of results) {
    const [official] = await db
      .select()
      .from(officials)
      .where(eq(officials.anId, result.id_an))
      .limit(1);

    if (!official) continue;

    const existing = await db
      .select()
      .from(electoralResults)
      .where(
        and(
          eq(electoralResults.officialId, official.id),
          eq(electoralResults.electionType, result.election_type),
          eq(electoralResults.electionDate, result.election_date),
          eq(electoralResults.round, result.round),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(electoralResults).values({
        officialId: official.id,
        electionType: result.election_type,
        electionDate: result.election_date,
        round: result.round,
        scorePercent: result.score_percent,
        opponentCount: result.opponent_count,
      });
      summary.created++;
    } else {
      await db
        .update(electoralResults)
        .set({
          scorePercent: result.score_percent,
          opponentCount: result.opponent_count,
          updatedAt: new Date(),
        })
        .where(eq(electoralResults.id, existing[0].id));
      summary.updated++;
    }

    await writeProvenance(db, {
      sourceTable: 'electoral_results',
      sourceRecordId: `${result.id_an}:${result.election_type}:${result.election_date}:${result.round}`,
      sourceName: SOURCE_NAME,
      sourceUrl: 'https://www.data.gouv.fr/fr/pages/donnees-des-elections/',
      legalBasis: LEGAL_BASIS,
      rawData: result,
    });
  }

  return summary;
}
