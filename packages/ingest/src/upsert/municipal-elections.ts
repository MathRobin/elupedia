/**
 * Upsert des résultats des élections municipales (fichiers du ministère de
 * l'Intérieur, `sources/municipal-elections.ts`), appelé par le script
 * `ingest:maires` (`run-maires.ts`).
 *
 * Tables écrites : `municipal_elections` (une ligne par scrutin × commune) et
 * `municipal_candidates` (une ligne par liste/candidat).
 *
 * Clés de rapprochement (ON CONFLICT) :
 * - élection : (election_id, commune_code) ;
 * - candidat : (election_id, panneau).
 * Le rattachement candidat → `officials` se fait par nom + prénom normalisés
 * uniquement (pas de date de naissance dans la source) : il est donc
 * approximatif et peut être écrasé à chaque passage.
 *
 * Idempotent : tout est réécrit à chaque passage (`excluded.*`), rien n'est
 * préservé.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import {
  officials,
  municipalElections,
  municipalCandidates,
} from '@elupedia/shared';
import type { MunicipalGeneralResult } from '../sources/municipal-elections.js';
import { logger } from '../logger.js';

/** Taille des INSERT groupés de candidats (limite de paramètres Postgres). */
const CANDIDATE_CHUNK_SIZE = 500;

/** Nombre de communes traitées par lot (un INSERT d'élections par lot). */
const ELECTION_BATCH_SIZE = 200;

/** Un log d'avancement toutes les N lots. */
const LOG_EVERY_BATCHES = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Minuscules, sans accents, séparateurs uniformisés : clé de rapprochement. */
function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

/**
 * Upsert des résultats municipaux par lots de communes. Écrit dans
 * `municipal_elections` et `municipal_candidates`. Retourne des compteurs
 * (élections, candidats, candidats rattachés à un official).
 */
export async function upsertMunicipalElections(
  db: NeonHttpDatabase,
  results: MunicipalGeneralResult[],
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

  for (let offset = 0; offset < results.length; offset += ELECTION_BATCH_SIZE) {
    const batch = results.slice(offset, offset + ELECTION_BATCH_SIZE);
    const batchNum = Math.floor(offset / ELECTION_BATCH_SIZE) + 1;
    if (batchNum % LOG_EVERY_BATCHES === 1) {
      logger.info(`  Processing batch ${batchNum}/${totalBatches}`);
    }

    const insertedElections = await db
      .insert(municipalElections)
      .values(
        batch.map((result) => ({
          electionId: result.electionId,
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
        target: [municipalElections.electionId, municipalElections.communeCode],
        set: {
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
        id: municipalElections.id,
        electionId: municipalElections.electionId,
        communeCode: municipalElections.communeCode,
      });

    summary.elections += insertedElections.length;

    // Les candidats référencent la PK interne (uuid) de la ligne élection, pas
    // la clé métier : on la récupère via le RETURNING de l'upsert ci-dessus.
    const electionRowIdByKey = new Map<string, string>();
    for (const election of insertedElections) {
      electionRowIdByKey.set(
        `${election.electionId}|${election.communeCode}`,
        election.id,
      );
    }

    const candidateRows: (typeof municipalCandidates.$inferInsert)[] = [];
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
          liste: candidate.liste,
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
        .insert(municipalCandidates)
        .values(candidateChunk)
        .onConflictDoUpdate({
          target: [municipalCandidates.electionId, municipalCandidates.panneau],
          set: {
            nom: sql`excluded.nom`,
            prenom: sql`excluded.prenom`,
            sexe: sql`excluded.sexe`,
            nuance: sql`excluded.nuance`,
            liste: sql`excluded.liste`,
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
    `Municipal elections: ${summary.elections} elections, ${summary.candidates} candidates, ${summary.matched} matched to officials`,
  );
  return summary;
}
