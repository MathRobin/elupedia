/**
 * Upsert des résultats des élections législatives par commune (données du
 * ministère de l'Intérieur, `sources/legislative-elections.ts`) : une ligne
 * de participation par (élection, commune) et une ligne par candidat.
 * Appelé par `run-an.ts`.
 *
 * Tables écrites : `legislative_elections` (index unique
 * (election_id, commune_code)) et `legislative_candidates` (index unique
 * (election_id = FK vers la ligne précédente, panneau)).
 * Idempotent : ON CONFLICT DO UPDATE réécrit tous les champs des deux
 * tables, `official_id` du candidat compris — le rattachement est recalculé
 * à chaque run.
 * Rattachement candidat -> official : clé `nom|prénom` normalisée (sans
 * accents, tirets/espaces repliés) ; en cas d'homonymes en base, le dernier
 * official chargé l'emporte silencieusement.
 * Le compteur `elections` compte les lignes upsertées (pas seulement
 * créées).
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import {
  officials,
  legislativeElections,
  legislativeCandidates,
} from '@elupedia/shared';
import type { LegislativeGeneralResult } from '../sources/legislative-elections.js';
import { logger } from '../logger.js';

// Nombre de (élection, commune) par itération.
const ELECTION_BATCH_SIZE = 200;
// Taille max d'un INSERT multi-lignes de candidats.
const CANDIDATE_CHUNK_SIZE = 500;
// Un log de progression toutes les N itérations de lot.
const PROGRESS_LOG_EVERY_BATCHES = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

/**
 * Upsert en base des résultats par commune et des candidats (écriture DB).
 * Retourne le nombre d'élections (lignes commune) et de candidats upsertés,
 * et le nombre de candidats rattachés à un official.
 */
export async function upsertLegislativeElections(
  db: NeonHttpDatabase,
  results: LegislativeGeneralResult[],
) {
  const summary = { elections: 0, candidates: 0, matched: 0 };

  const allOfficials = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials);

  const officialByName = new Map<string, string>();
  for (const official of allOfficials) {
    const key = `${normalize(official.lastName)}|${normalize(official.firstName)}`;
    officialByName.set(key, official.id);
  }

  logger.info(`  ${officialByName.size} officials loaded for matching`);

  const totalBatches = Math.ceil(results.length / ELECTION_BATCH_SIZE);

  for (let i = 0; i < results.length; i += ELECTION_BATCH_SIZE) {
    const batch = results.slice(i, i + ELECTION_BATCH_SIZE);
    const batchNum = Math.floor(i / ELECTION_BATCH_SIZE) + 1;
    if (batchNum % PROGRESS_LOG_EVERY_BATCHES === 1) {
      logger.info(`  Processing batch ${batchNum}/${totalBatches}`);
    }

    const upsertedElections = await db
      .insert(legislativeElections)
      .values(
        batch.map((result) => ({
          electionId: result.electionId,
          departementCode: result.departementCode,
          communeCode: result.communeCode,
          communeName: result.communeName,
          round: result.round,
          electionDate: result.electionDate,
          inscrits: result.inscrits,
          abstentions: result.abstentions,
          votants: result.votants,
          blancs: result.blancs,
          nuls: result.nuls,
          exprimes: result.exprimes,
        })),
      )
      .onConflictDoUpdate({
        target: [
          legislativeElections.electionId,
          legislativeElections.communeCode,
        ],
        set: {
          departementCode: sql`excluded.departement_code`,
          communeName: sql`excluded.commune_name`,
          round: sql`excluded.round`,
          electionDate: sql`excluded.election_date`,
          inscrits: sql`excluded.inscrits`,
          abstentions: sql`excluded.abstentions`,
          votants: sql`excluded.votants`,
          blancs: sql`excluded.blancs`,
          nuls: sql`excluded.nuls`,
          exprimes: sql`excluded.exprimes`,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: legislativeElections.id,
        electionId: legislativeElections.electionId,
        communeCode: legislativeElections.communeCode,
      });

    summary.elections += upsertedElections.length;

    // `electionId` source (ex. "LG2024") + commune -> uuid de la ligne
    // `legislative_elections`, clé étrangère des candidats.
    const electionRowIdByKey = new Map<string, string>();
    for (const election of upsertedElections) {
      electionRowIdByKey.set(
        `${election.electionId}|${election.communeCode}`,
        election.id,
      );
    }

    const candidateRows: (typeof legislativeCandidates.$inferInsert)[] = [];
    for (const result of batch) {
      const electionRowId = electionRowIdByKey.get(
        `${result.electionId}|${result.communeCode}`,
      );
      if (!electionRowId) continue;

      for (const candidate of result.candidates) {
        const officialKey = `${normalize(candidate.nom)}|${normalize(candidate.prenom)}`;
        const officialId = officialByName.get(officialKey) ?? null;
        if (officialId) summary.matched++;

        candidateRows.push({
          electionId: electionRowId,
          panneau: candidate.panneau,
          nom: candidate.nom,
          prenom: candidate.prenom,
          sexe: candidate.sexe,
          nuance: candidate.nuance,
          voix: candidate.voix,
          ratioInscrits: candidate.ratioInscrits,
          ratioExprimes: candidate.ratioExprimes,
          officialId,
        });
      }
    }

    for (const candidateChunk of chunk(candidateRows, CANDIDATE_CHUNK_SIZE)) {
      if (candidateChunk.length === 0) continue;
      await db
        .insert(legislativeCandidates)
        .values(candidateChunk)
        .onConflictDoUpdate({
          target: [
            legislativeCandidates.electionId,
            legislativeCandidates.panneau,
          ],
          set: {
            nom: sql`excluded.nom`,
            prenom: sql`excluded.prenom`,
            sexe: sql`excluded.sexe`,
            nuance: sql`excluded.nuance`,
            voix: sql`excluded.voix`,
            ratioInscrits: sql`excluded.ratio_inscrits`,
            ratioExprimes: sql`excluded.ratio_exprimes`,
            officialId: sql`excluded.official_id`,
            updatedAt: new Date(),
          },
        });
      summary.candidates += candidateChunk.length;
    }
  }

  logger.info(
    `Legislative elections: ${summary.elections} elections, ${summary.candidates} candidates, ${summary.matched} matched to officials`,
  );
  return summary;
}
