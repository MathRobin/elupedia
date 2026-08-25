import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, ballots, votes } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { SenatScrutinWithVotes } from '../sources/senat-scrutins.js';
import { mapSenatVotePosition } from '../sources/senat-scrutins.js';
import { logger } from '../logger.js';

export async function upsertSenatVotes(
  db: NeonHttpDatabase,
  scrutins: SenatScrutinWithVotes[],
) {
  const summary = { ballots: 0, votes: 0 };

  const senatorsCache = new Map<string, string>();

  for (const scrutin of scrutins) {
    const ballotAnId = `senat-scrutin-${scrutin.session}-${scrutin.number}`;

    const existingBallot = await db
      .select()
      .from(ballots)
      .where(eq(ballots.anId, ballotAnId))
      .limit(1);

    let ballotId: string;

    if (existingBallot.length > 0) {
      ballotId = existingBallot[0].id;
    } else {
      const [inserted] = await db
        .insert(ballots)
        .values({
          anId: ballotAnId,
          title: scrutin.title,
          date: scrutin.date,
          type: 'ordinaire',
        })
        .returning();
      ballotId = inserted!.id;
      summary.ballots++;
    }

    for (const v of scrutin.votes) {
      let officialId = senatorsCache.get(v.matricule);
      if (!officialId) {
        const matches = await db
          .select({ id: officials.id })
          .from(officials)
          .where(eq(officials.senatId, v.matricule))
          .limit(1);
        if (matches.length === 0) continue;
        officialId = matches[0].id;
        senatorsCache.set(v.matricule, officialId);
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
          position: mapSenatVotePosition(v.position),
        });
        summary.votes++;
      }
    }
  }

  logger.info(
    `Senate votes: ${summary.ballots} new ballots, ${summary.votes} new votes`,
  );
  return summary;
}
