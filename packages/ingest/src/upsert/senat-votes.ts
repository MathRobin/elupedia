/**
 * Insertion des scrutins publics du Sénat et des votes individuels
 * (`sources/senat-scrutins.ts`), appelé par `run-senat.ts` (`ingest:senat`).
 *
 * Tables écrites : `ballots` et `votes`.
 * Clés de rapprochement :
 * - scrutin : `ballots.an_id` (colonne partagée avec l'AN) porte ici la clé
 *   synthétique `senat-scrutin-<session>-<numéro>` ;
 * - vote : (ballot, official via `senat_id` = matricule).
 *
 * Insert-only : un scrutin ou un vote déjà connus ne sont jamais réécrits
 * (titre, date, position figés à la première ingestion). Les votes de
 * sénateurs sans fiche sont ignorés silencieusement.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, ballots, votes } from '@elupedia/shared';
import { eq, isNotNull } from 'drizzle-orm';
import type { SenatScrutinWithVotes } from '../sources/senat-scrutins.js';
import { mapSenatVotePosition } from '../sources/senat-scrutins.js';
import { logger } from '../logger.js';

/** Taille des INSERT groupés de votes (limite de paramètres Postgres). */
const VOTE_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Insère les scrutins et votes inconnus. Écrit dans `ballots` et `votes`.
 * Retourne le nombre de scrutins et de votes créés.
 */
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
    senators.map((senator) => [senator.senatId as string, senator.id]),
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
    const existingOfficialIds = new Set(
      existingVotes.map((vote) => vote.officialId),
    );

    const newVoteRows: (typeof votes.$inferInsert)[] = [];
    for (const vote of scrutin.votes) {
      const officialId = senatorByMatricule.get(vote.matricule);
      if (!officialId || existingOfficialIds.has(officialId)) continue;

      newVoteRows.push({
        ballotId,
        officialId,
        position: mapSenatVotePosition(vote.position),
      });
      // Un même sénateur peut apparaître deux fois dans un scrutin source
      // (ex. vote par délégation) : on ne garde que la première position.
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
