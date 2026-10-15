/**
 * Upsert des votes d'un député sur les scrutins publics de l'AN, un
 * official à la fois. Historiquement appelé par l'ingestion AN ; aujourd'hui
 * `run-an.ts` passe par `upsert/an-votes.ts` (traitement groupé) et ce
 * module n'a plus d'appelant hors tests.
 *
 * Tables écrites : `ballots`, `votes` et `data_provenance`.
 * Clés de rapprochement :
 * - scrutin : `ballots.an_id` = `scrutin-<id AN>` ;
 * - vote : (ballot, official).
 *
 * Idempotent : la position d'un vote existant est réécrite ; un scrutin déjà
 * connu n'est jamais modifié (titre, date, type figés).
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { ballots, votes } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import { writeProvenance } from './provenance.js';

const SOURCE_NAME = 'Assemblée nationale - Open Data';
const LEGAL_BASIS =
  'Données publiques de scrutin parlementaire (art. L311-1 CRPA)';

/** Un vote tel que lu côté AN (champs en français, nommage de la source). */
export interface VoteDetail {
  scrutin_id: number;
  scrutin_titre: string;
  scrutin_date: string;
  scrutin_type?: string;
  position: string;
}

type VotePosition = 'for' | 'against' | 'abstain' | 'absent';

/**
 * Traduit la position AN (« pour », « contre », « abstention », « absent »,
 * « non-votant ») vers l'enum interne, insensible à la casse. Toute valeur
 * inconnue est rangée en `absent` plutôt que de faire échouer l'ingestion.
 */
function mapPosition(position: string): VotePosition {
  const positionByAnLabel: Record<string, VotePosition> = {
    pour: 'for',
    contre: 'against',
    abstention: 'abstain',
    absent: 'absent',
    'non-votant': 'absent',
  };
  return positionByAnLabel[position.toLowerCase()] ?? 'absent';
}

/**
 * Upsert des votes d'un official. Écrit dans `ballots`, `votes` et
 * `data_provenance`. Retourne `{ ballotId, officialId }` par vote traité.
 */
export async function upsertVotes(
  db: NeonHttpDatabase,
  officialId: string,
  voteDetails: VoteDetail[],
) {
  const results = [];

  for (const vote of voteDetails) {
    const scrutinAnId = `scrutin-${vote.scrutin_id}`;

    const existingBallot = await db
      .select()
      .from(ballots)
      .where(eq(ballots.anId, scrutinAnId))
      .limit(1);

    let ballotId: string;

    if (existingBallot.length > 0) {
      ballotId = existingBallot[0].id;
    } else {
      const [inserted] = await db
        .insert(ballots)
        .values({
          anId: scrutinAnId,
          title: vote.scrutin_titre,
          date: vote.scrutin_date,
          type: vote.scrutin_type ?? 'ordinaire',
        })
        .returning();
      ballotId = inserted!.id;
    }

    const existingVote = await db
      .select()
      .from(votes)
      .where(
        and(eq(votes.ballotId, ballotId), eq(votes.officialId, officialId)),
      )
      .limit(1);

    if (existingVote.length === 0) {
      await db.insert(votes).values({
        ballotId,
        officialId,
        position: mapPosition(vote.position),
      });
    } else {
      await db
        .update(votes)
        .set({ position: mapPosition(vote.position) })
        .where(eq(votes.id, existingVote[0].id));
    }

    await writeProvenance(db, {
      sourceTable: 'votes',
      sourceRecordId: `${scrutinAnId}:${officialId}`,
      sourceName: SOURCE_NAME,
      // Législature codée en dur (17e) : l'URL cesserait d'être exacte pour
      // des scrutins d'une autre législature.
      sourceUrl: `https://www.assemblee-nationale.fr/dyn/17/scrutins/${vote.scrutin_id}`,
      legalBasis: LEGAL_BASIS,
      rawData: vote,
    });

    results.push({ ballotId, officialId });
  }

  return results;
}

export { mapPosition };
