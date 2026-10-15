/**
 * Upsert des résultats des sénatoriales 2026 (senatoriales2026.senat.fr,
 * `sources/senat-resultats-2026.ts`), appelé par `run-senat-resultats.ts`
 * (`ingest:senat:resultats`) avant `upsert/senat-mandats-2026.ts`.
 *
 * Tables écrites : `senatorial_elections` (une ligne par département × tour)
 * et `senatorial_candidates`.
 *
 * Clés de rapprochement (ON CONFLICT) :
 * - élection : (election_year, departement_code, round) ;
 * - candidat : (election_id, nom, prenom).
 * Rattachement candidat → `officials` par nom + prénom normalisés : approximatif.
 *
 * Idempotent. Jamais écrasé : `sortant`, posé par l'ingestion des
 * candidatures (voir commentaire dans le code).
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  officials,
  senatorialElections,
  senatorialCandidates,
} from '@elupedia/shared';
import type { SenatorialResultDepartement } from '../sources/senat-resultats-2026.js';
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
 * Complète les lignes créées par l'ingestion des candidatures (round=1,
 * voir upsert/senat-candidacies.ts) avec les résultats réels une fois le
 * scrutin dépouillé, et crée les lignes round=2 pour les rares départements
 * majoritaires où un second tour a eu lieu (ex. Guyane). Cible la même clé
 * unique (electionYear, departementCode, round) que les deux autres
 * ingestions sénatoriales 2026. Écrit dans `senatorial_elections` et
 * `senatorial_candidates`. Retourne des compteurs.
 */
export async function upsertSenatorialResults2026(
  db: NeonHttpDatabase,
  departements: SenatorialResultDepartement[],
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

  for (const departement of departements) {
    for (const round of departement.rounds) {
      const [election] = await db
        .insert(senatorialElections)
        .values({
          electionYear: departement.electionYear,
          departementCode: departement.departementCode,
          departementName: departement.departementName,
          scrutinType: departement.scrutinType,
          round: round.round,
          electionDate: departement.electionDate,
          siegesAPourvoir: departement.siegesAPourvoir,
          electeursSenatoriaux: departement.electeursSenatoriaux,
        })
        .onConflictDoUpdate({
          target: [
            senatorialElections.electionYear,
            senatorialElections.departementCode,
            senatorialElections.round,
          ],
          set: {
            departementName: departement.departementName,
            scrutinType: departement.scrutinType,
            electionDate: departement.electionDate,
            siegesAPourvoir: departement.siegesAPourvoir,
            electeursSenatoriaux: departement.electeursSenatoriaux,
            updatedAt: new Date(),
          },
        })
        .returning({ id: senatorialElections.id });

      summary.elections++;

      for (const candidate of round.candidates) {
        const officialKey = `${normalize(candidate.nom)}|${normalize(candidate.prenom)}`;
        const officialId = officialByName.get(officialKey) ?? null;
        if (officialId) summary.matched++;

        await db
          .insert(senatorialCandidates)
          .values({
            electionId: election.id,
            nom: candidate.nom,
            prenom: candidate.prenom,
            nuance: candidate.nuance,
            liste: candidate.liste,
            voix: candidate.voix,
            ratioExprimes: candidate.ratioExprimes,
            elected: candidate.elected,
            officialId,
          })
          .onConflictDoUpdate({
            target: [
              senatorialCandidates.electionId,
              senatorialCandidates.nom,
              senatorialCandidates.prenom,
            ],
            // sortant n'est volontairement pas mis à jour ici : la ligne
            // round=1 porte déjà la valeur déclarée par la candidature
            // (upsert/senat-candidacies.ts), qu'il ne faut pas écraser par
            // le défaut faute d'info équivalente côté résultats.
            set: {
              nuance: candidate.nuance,
              liste: candidate.liste,
              voix: candidate.voix,
              ratioExprimes: candidate.ratioExprimes,
              elected: candidate.elected,
              officialId,
              updatedAt: new Date(),
            },
          });

        summary.candidates++;
      }
    }
  }

  logger.info(
    `Senatorial results 2026: ${summary.elections} elections, ${summary.candidates} candidates, ${summary.matched} rattachés à une fiche`,
  );
  return summary;
}
