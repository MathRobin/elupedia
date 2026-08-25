import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { ballots, votes, dataProvenance } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';

const SOURCE_NAME = 'Assemblée nationale - Open Data';
const LEGAL_BASIS =
  'Données publiques de scrutin parlementaire (art. L311-1 CRPA)';
export interface VoteDetail {
  scrutin_id: number;
  scrutin_titre: string;
  scrutin_date: string;
  scrutin_type?: string;
  position: string;
}

function mapPosition(
  position: string,
): 'for' | 'against' | 'abstain' | 'absent' {
  const map: Record<string, 'for' | 'against' | 'abstain' | 'absent'> = {
    pour: 'for',
    contre: 'against',
    abstention: 'abstain',
    absent: 'absent',
    'non-votant': 'absent',
  };
  return map[position.toLowerCase()] ?? 'absent';
}

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

    const provRecordId = `${scrutinAnId}:${officialId}`;
    const existingProv = await db
      .select({ id: dataProvenance.id })
      .from(dataProvenance)
      .where(
        and(
          eq(dataProvenance.sourceTable, 'votes'),
          eq(dataProvenance.sourceRecordId, provRecordId),
        ),
      )
      .limit(1);

    if (existingProv.length === 0) {
      await db.insert(dataProvenance).values({
        sourceTable: 'votes',
        sourceRecordId: provRecordId,
        sourceName: SOURCE_NAME,
        sourceUrl: `https://www.assemblee-nationale.fr/dyn/17/scrutins/${vote.scrutin_id}`,
        legalBasis: LEGAL_BASIS,
        rawData: vote as unknown as Record<string, unknown>,
        fetchedAt: new Date(),
      });
    } else {
      await db
        .update(dataProvenance)
        .set({
          rawData: vote as unknown as Record<string, unknown>,
          fetchedAt: new Date(),
        })
        .where(eq(dataProvenance.id, existingProv[0].id));
    }

    results.push({ ballotId, officialId });
  }

  return results;
}

export { mapPosition };
