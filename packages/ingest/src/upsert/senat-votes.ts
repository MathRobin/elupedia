import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, ballots, votes } from '@elupedia/shared';
import { eq, isNotNull } from 'drizzle-orm';
import type { SenatScrutinWithVotes } from '../sources/senat-scrutins.js';
import { mapSenatVotePosition } from '../sources/senat-scrutins.js';
import { logger } from '../logger.js';

const VOTE_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function upsertSenatVotes(
  db: NeonHttpDatabase,
  scrutins: SenatScrutinWithVotes[],
) {
  const summary = { ballots: 0, votes: 0 };

  const senators = await db
    .select({ id: officials.id, senatId: officials.senatId })
    .from(officials)
    .where(isNotNull(officials.senatId));
  const senatorByMatricule = new Map(
    senators.map((s) => [s.senatId as string, s.id]),
  );

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

    const existingVotes = await db
      .select({ officialId: votes.officialId })
      .from(votes)
      .where(eq(votes.ballotId, ballotId));
    const existingOfficialIds = new Set(existingVotes.map((v) => v.officialId));

    const newVoteRows: (typeof votes.$inferInsert)[] = [];
    for (const v of scrutin.votes) {
      const officialId = senatorByMatricule.get(v.matricule);
      if (!officialId || existingOfficialIds.has(officialId)) continue;

      newVoteRows.push({
        ballotId,
        officialId,
        position: mapSenatVotePosition(v.position),
      });
      existingOfficialIds.add(officialId);
    }

    for (const voteChunk of chunk(newVoteRows, VOTE_CHUNK_SIZE)) {
      await db.insert(votes).values(voteChunk);
      summary.votes += voteChunk.length;
    }
  }

  logger.info(
    `Senate votes: ${summary.ballots} new ballots, ${summary.votes} new votes`,
  );
  return summary;
}
