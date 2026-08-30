import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { ballots, votes, officials } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import { type Scrutin } from '../sources/an-scrutins.js';
import { logger } from '../logger.js';

const POSITION_MAP: Record<string, 'for' | 'against' | 'abstain' | 'absent'> = {
  pour: 'for',
  contre: 'against',
  abstention: 'abstain',
  'non-votant': 'absent',
};

export async function upsertAnVotes(
  db: NeonHttpDatabase,
  scrutins: Scrutin[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  const allOfficials = await db
    .select({ id: officials.id, anId: officials.anId })
    .from(officials);
  const officialByAnId = new Map<string, string>();
  for (const o of allOfficials) {
    if (o.anId) officialByAnId.set(o.anId, o.id);
  }

  for (const scrutin of scrutins) {
    const scrutinAnId = `scrutin-${scrutin.uid}`;

    const existingBallot = await db
      .select({ id: ballots.id })
      .from(ballots)
      .where(eq(ballots.anId, scrutinAnId))
      .limit(1);

    let ballotId: string;

    if (existingBallot.length > 0) {
      ballotId = existingBallot[0].id;
      await db
        .update(ballots)
        .set({
          title: scrutin.titre,
          date: scrutin.date,
          type: scrutin.type,
        })
        .where(eq(ballots.id, ballotId));
    } else {
      const [inserted] = await db
        .insert(ballots)
        .values({
          anId: scrutinAnId,
          title: scrutin.titre,
          date: scrutin.date,
          type: scrutin.type,
        })
        .returning({ id: ballots.id });
      ballotId = inserted!.id;
      created++;
    }

    for (const v of scrutin.votants) {
      const officialId = officialByAnId.get(v.acteurRef);
      if (!officialId) continue;

      const position = POSITION_MAP[v.position] ?? 'absent';

      const existing = await db
        .select({ id: votes.id })
        .from(votes)
        .where(
          and(eq(votes.ballotId, ballotId), eq(votes.officialId, officialId)),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(votes).values({ ballotId, officialId, position });
        created++;
      } else if (existing.length > 0) {
        await db
          .update(votes)
          .set({ position })
          .where(eq(votes.id, existing[0].id));
        updated++;
      }
    }
  }

  logger.info(`AN votes: ${created} created, ${updated} updated`);
  return { created, updated };
}
