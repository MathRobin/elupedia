import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql, inArray, eq } from 'drizzle-orm';
import {
  ballots,
  votes,
  officials,
  ballotGroupPositions,
} from '@elupedia/shared';
import { type Scrutin } from '../sources/an-scrutins.js';
import { GP_FALLBACK } from '../sources/assemblee-nationale.js';
import { logger } from '../logger.js';

const POSITION_MAP: Record<string, 'for' | 'against' | 'abstain' | 'absent'> = {
  pour: 'for',
  contre: 'against',
  abstention: 'abstain',
  'non-votant': 'absent',
};

const SCRUTIN_BATCH_SIZE = 50;
const VOTE_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

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

  for (const scrutinBatch of chunk(scrutins, SCRUTIN_BATCH_SIZE)) {
    const batchAnIds = scrutinBatch.map((s) => `scrutin-${s.uid}`);
    const preExisting = await db
      .select({ anId: ballots.anId })
      .from(ballots)
      .where(inArray(ballots.anId, batchAnIds));
    const preExistingAnIds = new Set(preExisting.map((b) => b.anId));

    const insertedBallots = await db
      .insert(ballots)
      .values(
        scrutinBatch.map((s) => ({
          anId: `scrutin-${s.uid}`,
          title: s.titre,
          date: s.date,
          type: s.type,
        })),
      )
      .onConflictDoUpdate({
        target: ballots.anId,
        set: {
          title: sql`excluded.title`,
          date: sql`excluded.date`,
          type: sql`excluded.type`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: ballots.id, anId: ballots.anId });

    const ballotIdByAnId = new Map(insertedBallots.map((b) => [b.anId, b.id]));
    const ballotIds = insertedBallots.map((b) => b.id);
    created += insertedBallots.filter(
      (b) => !preExistingAnIds.has(b.anId),
    ).length;

    const existingVotes = await db
      .select({
        id: votes.id,
        ballotId: votes.ballotId,
        officialId: votes.officialId,
        position: votes.position,
        seatNumber: votes.seatNumber,
      })
      .from(votes)
      .where(inArray(votes.ballotId, ballotIds));

    const existingVoteByKey = new Map(
      existingVotes.map((v) => [`${v.ballotId}|${v.officialId}`, v]),
    );

    const newVoteRows: (typeof votes.$inferInsert)[] = [];
    const voteUpdates: {
      id: string;
      position: string;
      seatNumber: number | null;
    }[] = [];
    const groupPositionByKey = new Map<
      string,
      typeof ballotGroupPositions.$inferInsert
    >();

    for (const scrutin of scrutinBatch) {
      const ballotId = ballotIdByAnId.get(`scrutin-${scrutin.uid}`);
      if (!ballotId) continue;

      for (const v of scrutin.votants) {
        const officialId = officialByAnId.get(v.acteurRef);
        if (!officialId) continue;

        const position = POSITION_MAP[v.position] ?? 'absent';
        const existing = existingVoteByKey.get(`${ballotId}|${officialId}`);

        if (!existing) {
          newVoteRows.push({
            ballotId,
            officialId,
            position,
            seatNumber: v.seatNumber,
          });
        } else if (
          existing.position !== position ||
          existing.seatNumber !== v.seatNumber
        ) {
          voteUpdates.push({
            id: existing.id,
            position,
            seatNumber: v.seatNumber,
          });
        }
      }

      for (const gp of scrutin.groupPositions) {
        const groupName = GP_FALLBACK[gp.organeRef] ?? gp.organeRef;
        const position =
          POSITION_MAP[gp.positionMajoritaire] ?? gp.positionMajoritaire;

        // Certains scrutins comportent plusieurs entrées pour le même
        // organeRef (ex. "PO0" utilisé comme code générique) : on ne garde
        // que la dernière, un INSERT multi-lignes ne pouvant pas cibler la
        // même ligne deux fois via ON CONFLICT DO UPDATE.
        groupPositionByKey.set(`${ballotId}|${gp.organeRef}`, {
          ballotId,
          organeRef: gp.organeRef,
          groupName,
          position,
          memberCount: gp.memberCount || null,
          votesFor: gp.votesFor,
          votesAgainst: gp.votesAgainst,
          votesAbstain: gp.votesAbstain,
          votesAbsent: gp.votesAbsent,
        });
      }
    }

    for (const voteChunk of chunk(newVoteRows, VOTE_CHUNK_SIZE)) {
      await db.insert(votes).values(voteChunk);
      created += voteChunk.length;
    }

    for (const u of voteUpdates) {
      await db
        .update(votes)
        .set({
          position: u.position,
          seatNumber: u.seatNumber,
          updatedAt: new Date(),
        })
        .where(eq(votes.id, u.id));
      updated++;
    }

    const groupPositionRows = [...groupPositionByKey.values()];
    for (const gpChunk of chunk(groupPositionRows, VOTE_CHUNK_SIZE)) {
      await db
        .insert(ballotGroupPositions)
        .values(gpChunk)
        .onConflictDoUpdate({
          target: [
            ballotGroupPositions.ballotId,
            ballotGroupPositions.organeRef,
          ],
          set: {
            groupName: sql`excluded.group_name`,
            position: sql`excluded.position`,
            memberCount: sql`excluded.member_count`,
            votesFor: sql`excluded.votes_for`,
            votesAgainst: sql`excluded.votes_against`,
            votesAbstain: sql`excluded.votes_abstain`,
            votesAbsent: sql`excluded.votes_absent`,
            updatedAt: new Date(),
          },
        });
    }
  }

  logger.info(`AN votes: ${created} created, ${updated} updated`);
  return { created, updated };
}
