/**
 * Upsert des résultats des sénatoriales passées, par département et par tour
 * (open data Sénat, `sources/senat-elections.ts`), appelé par `run-senat.ts`
 * (`ingest:senat`).
 *
 * Tables écrites : `senatorial_elections` (chiffres de participation) et
 * `senatorial_candidates` (voix, score, élu).
 *
 * Clés de rapprochement (ON CONFLICT) :
 * - élection : (election_year, departement_code, round) — même clé que les
 *   ingestions 2026 (`senat-candidacies.ts`, `senat-resultats-2026.ts`), dont
 *   elle complète les lignes une fois les résultats publiés ;
 * - candidat : (election_id, nom, prenom).
 * Rattachement candidat → `officials` par nom + prénom normalisés : approximatif.
 *
 * Idempotent : tout est réécrit à chaque passage.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  officials,
  senatorialElections,
  senatorialCandidates,
} from '@elupedia/shared';
import type { SenatorialDepartementResult } from '../sources/senat-elections.js';
import { logger } from '../logger.js';

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
 * Upsert des résultats sénatoriaux. Écrit dans `senatorial_elections` et
 * `senatorial_candidates`. Retourne des compteurs.
 */
export async function upsertSenatorialElections(
  db: NeonHttpDatabase,
  results: SenatorialDepartementResult[],
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

  for (const result of results) {
    const [election] = await db
      .insert(senatorialElections)
      .values({
        electionYear: result.electionYear,
        departementCode: result.departementCode,
        departementName: result.departementName,
        scrutinType: result.scrutinType,
        round: result.round,
        electionDate: result.electionDate,
        inscrits: result.inscrits,
        abstentions: result.abstentions,
        votants: result.votants,
        blancs: result.blancs,
        nuls: result.nuls,
        exprimes: result.exprimes,
      })
      .onConflictDoUpdate({
        target: [
          senatorialElections.electionYear,
          senatorialElections.departementCode,
          senatorialElections.round,
        ],
        set: {
          departementName: result.departementName,
          scrutinType: result.scrutinType,
          electionDate: result.electionDate,
          inscrits: result.inscrits,
          abstentions: result.abstentions,
          votants: result.votants,
          blancs: result.blancs,
          nuls: result.nuls,
          exprimes: result.exprimes,
          updatedAt: new Date(),
        },
      })
      .returning({ id: senatorialElections.id });

    summary.elections++;

    for (const candidate of result.candidates) {
      const officialKey = `${normalize(candidate.nom)}|${normalize(candidate.prenom)}`;
      const officialId = officialByName.get(officialKey) ?? null;
      if (officialId) summary.matched++;

      await db
        .insert(senatorialCandidates)
        .values({
          electionId: election.id,
          nom: candidate.nom,
          prenom: candidate.prenom,
          sexe: candidate.sexe,
          nuance: candidate.nuance,
          voix: candidate.voix,
          ratioExprimes: candidate.scorePercent,
          elected: candidate.elected,
          officialId,
        })
        .onConflictDoUpdate({
          target: [
            senatorialCandidates.electionId,
            senatorialCandidates.nom,
            senatorialCandidates.prenom,
          ],
          set: {
            sexe: candidate.sexe,
            nuance: candidate.nuance,
            voix: candidate.voix,
            ratioExprimes: candidate.scorePercent,
            elected: candidate.elected,
            officialId,
            updatedAt: new Date(),
          },
        });

      summary.candidates++;
    }
  }

  logger.info(
    `Senatorial elections: ${summary.elections} elections, ${summary.candidates} candidates, ${summary.matched} matched to officials`,
  );
  return summary;
}
