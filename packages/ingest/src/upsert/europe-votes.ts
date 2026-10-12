/**
 * Upsert des votes nominatifs (roll-call) des eurodéputés français en
 * séance plénière du Parlement européen. Les séances et décisions viennent
 * de `sources/parlement-europeen-votes.ts` ; `run-europe.ts` (étape
 * « eurodeputes-votes ») fournit la liste des séances et une fonction de
 * récupération des décisions (avec retry et rate limit côté appelant).
 *
 * Tables écrites : `ballots` (clé `an_id` = "europarl-vote-<decision id>",
 * type 'europarl'), `votes` (clé logique (ballot_id, official_id)) et
 * `data_provenance` (source_table 'europarl_sittings' : une ligne par séance
 * entièrement traitée, utilisée comme marqueur « ne plus rejouer »).
 * Idempotent : insert-only — un ballot ou un vote déjà présent n'est jamais
 * mis à jour (titre, position…). Seuls les votants dont le person id
 * correspond à `officials.europarl_id` sont conservés.
 * Les séances « définitives » (plus de 2 jours, cf. isSittingFinal) déjà
 * marquées sont ignorées sans appel réseau ; les séances récentes sont
 * rejouées à chaque run (les résultats peuvent encore être publiés).
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, ballots, votes, dataProvenance } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type {
  PlenarySitting,
  RollcallDecision,
} from '../sources/parlement-europeen-votes.js';
import { logger } from '../logger.js';

const SOURCE_NAME = 'Parlement européen - Open Data API';
const LEGAL_BASIS = 'Licence CC BY 4.0 - data.europarl.europa.eu';
const PROVENANCE_TABLE = 'europarl_sittings';
// Un log de progression toutes les N séances.
const PROGRESS_LOG_EVERY = 20;

function ballotAnId(decisionId: string): string {
  return `europarl-vote-${decisionId}`;
}

/**
 * Une séance déjà entièrement traitée n'est jamais rejouée : une fois publiés,
 * les résultats d'un scrutin nominatif ne changent plus. On ne considère une
 * séance comme définitive que si elle date d'avant-hier ou plus (au cas où
 * des résultats seraient encore publiés dans les heures suivant la séance).
 */
export function isSittingFinal(
  sittingDate: string,
  today = new Date(),
): boolean {
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  return new Date(sittingDate) < twoDaysAgo;
}

/** Vrai si la séance a déjà été marquée traitée dans `data_provenance`. */
export async function wasSittingProcessed(
  db: NeonHttpDatabase,
  sittingId: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: dataProvenance.id })
    .from(dataProvenance)
    .where(
      and(
        eq(dataProvenance.sourceTable, PROVENANCE_TABLE),
        eq(dataProvenance.sourceRecordId, sittingId),
      ),
    )
    .limit(1);
  return existing.length > 0;
}

async function markSittingProcessed(
  db: NeonHttpDatabase,
  sitting: PlenarySitting,
  decisionCount: number,
): Promise<void> {
  await db.insert(dataProvenance).values({
    sourceTable: PROVENANCE_TABLE,
    sourceRecordId: sitting.id,
    sourceName: SOURCE_NAME,
    sourceUrl: `https://www.europarl.europa.eu/doceo/document/PV-10-${sitting.date}-VOT_FR.html`,
    legalBasis: LEGAL_BASIS,
    rawData: { decisionCount },
    fetchedAt: new Date(),
  });
}

export interface EuropeVotesSummary {
  /** Séances définitives déjà traitées, ignorées sans appel réseau. */
  sittingsSkipped: number;
  /** Ballots créés. */
  ballots: number;
  /** Ballots déjà en base (rejoués sans modification). */
  ballotsExisting: number;
  /** Votes créés. */
  votes: number;
}

/** Officials ayant un europarl_id : person id (europarl_id) -> official id. */
export async function loadOfficialIdsByEuroparlId(
  db: NeonHttpDatabase,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: officials.id, europarlId: officials.europarlId })
    .from(officials);
  const officialIdByEuroparlId = new Map<string, string>();
  for (const row of rows) {
    if (row.europarlId) officialIdByEuroparlId.set(row.europarlId, row.id);
  }
  return officialIdByEuroparlId;
}

/**
 * Insère les ballots et votes d'une séance (écriture DB, insert-only, une
 * requête d'existence par ballot et par vote). `officialIdByEuroparlId`
 * vient de loadOfficialIdsByEuroparlId.
 */
export async function upsertSittingVotes(
  db: NeonHttpDatabase,
  sitting: PlenarySitting,
  decisions: RollcallDecision[],
  officialIdByEuroparlId: Map<string, string>,
): Promise<{ ballots: number; ballotsExisting: number; votes: number }> {
  let ballotsCreated = 0;
  let ballotsExisting = 0;
  let votesCreated = 0;

  for (const decision of decisions) {
    const anId = ballotAnId(decision.id);
    const existingBallot = await db
      .select({ id: ballots.id })
      .from(ballots)
      .where(eq(ballots.anId, anId))
      .limit(1);

    let ballotId: string;
    if (existingBallot.length > 0) {
      ballotId = existingBallot[0].id;
      ballotsExisting++;
    } else {
      const [inserted] = await db
        .insert(ballots)
        .values({
          anId,
          title: decision.title,
          date: decision.date,
          type: 'europarl',
        })
        .returning();
      ballotId = inserted!.id;
      ballotsCreated++;
    }

    // Ne conserver que les eurodéputés français, conformément au périmètre
    // de la milestone (le scrutin porte sur ~700 votants au total).
    for (const [personId, position] of decision.votersByPersonId) {
      const officialId = officialIdByEuroparlId.get(personId);
      if (!officialId) continue;

      const existingVote = await db
        .select({ id: votes.id })
        .from(votes)
        .where(
          and(eq(votes.ballotId, ballotId), eq(votes.officialId, officialId)),
        )
        .limit(1);

      if (existingVote.length === 0) {
        await db.insert(votes).values({ ballotId, officialId, position });
        votesCreated++;
      }
    }
  }

  return { ballots: ballotsCreated, ballotsExisting, votes: votesCreated };
}

/**
 * Traite chaque séance : saute celles déjà définitives et marquées, sinon
 * récupère ses décisions via `fetchDecisions`, les upserte, et marque la
 * séance si elle est définitive (écriture DB). Une erreur sur une séance
 * interrompt le run.
 */
export async function upsertEuropeVotes(
  db: NeonHttpDatabase,
  sittings: PlenarySitting[],
  fetchDecisions: (sittingId: string) => Promise<RollcallDecision[]>,
): Promise<EuropeVotesSummary> {
  const summary: EuropeVotesSummary = {
    sittingsSkipped: 0,
    ballots: 0,
    ballotsExisting: 0,
    votes: 0,
  };

  const officialIdByEuroparlId = await loadOfficialIdsByEuroparlId(db);

  logger.info(`  ${sittings.length} sittings to process`);

  for (let i = 0; i < sittings.length; i++) {
    const sitting = sittings[i];

    if (i % PROGRESS_LOG_EVERY === 0) {
      logger.info(`  [${i + 1}/${sittings.length}] sittings...`);
    }

    try {
      const isFinal = isSittingFinal(sitting.date);
      if (isFinal && (await wasSittingProcessed(db, sitting.id))) {
        summary.sittingsSkipped++;
        continue;
      }

      const decisions = await fetchDecisions(sitting.id);
      const sittingResult = await upsertSittingVotes(
        db,
        sitting,
        decisions,
        officialIdByEuroparlId,
      );
      summary.ballots += sittingResult.ballots;
      summary.ballotsExisting += sittingResult.ballotsExisting;
      summary.votes += sittingResult.votes;

      if (isFinal) {
        await markSittingProcessed(db, sitting, decisions.length);
      }
    } catch (error) {
      logger.error(
        `  Failed processing sitting ${sitting.id} (${sitting.date}): ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  logger.info(
    `Europe votes: ${summary.sittingsSkipped} sittings skipped (already final), ${summary.ballots} new ballots, ${summary.votes} new votes`,
  );
  return summary;
}
