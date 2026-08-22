import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { ballots } from '@elupedia/shared';
import { votes } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { VoteDetail } from '../sources/nosdeputes-votes.js';

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

    results.push({ ballotId, officialId });
  }

  return results;
}

export { mapPosition };
