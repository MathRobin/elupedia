/**
 * Upsert des scrutins publics de l'Assemblée nationale : le scrutin lui-même,
 * le vote nominatif de chaque député français connu en base, et la position
 * majoritaire de chaque groupe. Données issues de `sources/an-scrutins.ts`,
 * appelé par `run-an.ts`.
 *
 * Tables écrites : `ballots` (clé `an_id` = "scrutin-<uid>", unique),
 * `votes` (clé logique (ballot_id, official_id), dédoublonnée côté
 * application — pas de contrainte unique en base), `ballot_group_positions`
 * (index unique (ballot_id, organe_ref)).
 * Idempotent : ballots et positions de groupe via ON CONFLICT DO UPDATE ;
 * les votes ne sont réécrits que si position ou numéro de siège a changé.
 * Les votants dont l'acteurRef n'a pas d'official (an_id) en base sont
 * ignorés. Traitement par lots de scrutins pour borner la taille des
 * requêtes ; un lot en échec fait remonter l'erreur (pas de reprise
 * partielle, le run est rejoué dans son ensemble).
 */
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

// Positions telles que libellées dans l'open data AN -> enum interne.
// Un vote individuel à position inconnue est stocké comme 'absent' ; une
// position de groupe inconnue est conservée telle quelle.
const POSITION_MAP: Record<string, 'for' | 'against' | 'abstain' | 'absent'> = {
  pour: 'for',
  contre: 'against',
  abstention: 'abstain',
  'non-votant': 'absent',
};

// Nombre de scrutins traités par itération (un scrutin = jusqu'à ~580 votes).
const SCRUTIN_BATCH_SIZE = 50;
// Taille max d'un INSERT multi-lignes (votes et positions de groupe).
const VOTE_CHUNK_SIZE = 500;
// Un log de progression toutes les N itérations de lot.
const PROGRESS_LOG_EVERY_BATCHES = 10;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function ballotAnId(scrutinUid: string): string {
  return `scrutin-${scrutinUid}`;
}

/**
 * Écrit scrutins, votes nominatifs et positions de groupe en base.
 * `created` additionne scrutins et votes créés ; `updated` ne compte que les
 * votes dont la position ou le siège a changé.
 */
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
  for (const official of allOfficials) {
    if (official.anId) officialByAnId.set(official.anId, official.id);
  }

  const batches = chunk(scrutins, SCRUTIN_BATCH_SIZE);
  logger.info(
    `  ${scrutins.length} scrutins to process in ${batches.length} batches (${officialByAnId.size} officials mapped)`,
  );

  for (const [batchIndex, scrutinBatch] of batches.entries()) {
    const batchNum = batchIndex + 1;
    if (
      batchNum % PROGRESS_LOG_EVERY_BATCHES === 1 ||
      batchNum === batches.length
    ) {
      logger.info(`  Processing batch ${batchNum}/${batches.length}`);
    }

    try {
      // Lu avant l'upsert uniquement pour distinguer créations et mises à
      // jour dans le compteur : l'upsert lui-même ne fait pas la différence.
      const batchAnIds = scrutinBatch.map((scrutin) => ballotAnId(scrutin.uid));
      const preExisting = await db
        .select({ anId: ballots.anId })
        .from(ballots)
        .where(inArray(ballots.anId, batchAnIds));
      const preExistingAnIds = new Set(
        preExisting.map((ballot) => ballot.anId),
      );

      const upsertedBallots = await db
        .insert(ballots)
        .values(
          scrutinBatch.map((scrutin) => ({
            anId: ballotAnId(scrutin.uid),
            title: scrutin.titre,
            date: scrutin.date,
            type: scrutin.type,
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

      const ballotIdByAnId = new Map(
        upsertedBallots.map((ballot) => [ballot.anId, ballot.id]),
      );
      const ballotIds = upsertedBallots.map((ballot) => ballot.id);
      created += upsertedBallots.filter(
        (ballot) => !preExistingAnIds.has(ballot.anId),
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
        existingVotes.map((vote) => [
          `${vote.ballotId}|${vote.officialId}`,
          vote,
        ]),
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
        const ballotId = ballotIdByAnId.get(ballotAnId(scrutin.uid));
        if (!ballotId) continue;

        for (const votant of scrutin.votants) {
          const officialId = officialByAnId.get(votant.acteurRef);
          if (!officialId) continue;

          const position = POSITION_MAP[votant.position] ?? 'absent';
          const existing = existingVoteByKey.get(`${ballotId}|${officialId}`);

          if (!existing) {
            newVoteRows.push({
              ballotId,
              officialId,
              position,
              seatNumber: votant.seatNumber,
            });
          } else if (
            existing.position !== position ||
            existing.seatNumber !== votant.seatNumber
          ) {
            voteUpdates.push({
              id: existing.id,
              position,
              seatNumber: votant.seatNumber,
            });
          }
        }

        for (const groupPosition of scrutin.groupPositions) {
          // Libellé du groupe résolu depuis la table statique GP_FALLBACK ;
          // à défaut on stocke l'organeRef brut plutôt que de perdre la ligne.
          const groupName =
            GP_FALLBACK[groupPosition.organeRef] ?? groupPosition.organeRef;
          const position =
            POSITION_MAP[groupPosition.positionMajoritaire] ??
            groupPosition.positionMajoritaire;

          // Certains scrutins comportent plusieurs entrées pour le même
          // organeRef (ex. "PO0" utilisé comme code générique) : on ne
          // garde que la dernière, un INSERT multi-lignes ne pouvant pas
          // cibler la même ligne deux fois via ON CONFLICT DO UPDATE.
          groupPositionByKey.set(`${ballotId}|${groupPosition.organeRef}`, {
            ballotId,
            organeRef: groupPosition.organeRef,
            groupName,
            position,
            memberCount: groupPosition.memberCount || null,
            votesFor: groupPosition.votesFor,
            votesAgainst: groupPosition.votesAgainst,
            votesAbstain: groupPosition.votesAbstain,
            votesAbsent: groupPosition.votesAbsent,
          });
        }
      }

      for (const voteChunk of chunk(newVoteRows, VOTE_CHUNK_SIZE)) {
        await db.insert(votes).values(voteChunk);
        created += voteChunk.length;
      }

      for (const voteUpdate of voteUpdates) {
        await db
          .update(votes)
          .set({
            position: voteUpdate.position,
            seatNumber: voteUpdate.seatNumber,
            updatedAt: new Date(),
          })
          .where(eq(votes.id, voteUpdate.id));
        updated++;
      }

      const groupPositionRows = [...groupPositionByKey.values()];
      for (const groupPositionChunk of chunk(
        groupPositionRows,
        VOTE_CHUNK_SIZE,
      )) {
        await db
          .insert(ballotGroupPositions)
          .values(groupPositionChunk)
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
    } catch (error) {
      logger.error(
        `  Batch ${batchNum}/${batches.length} failed (scrutins: ${scrutinBatch.map((scrutin) => scrutin.uid).join(', ')}): ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  logger.info(`AN votes: ${created} created, ${updated} updated`);
  return { created, updated };
}
