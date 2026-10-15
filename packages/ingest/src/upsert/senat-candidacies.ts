/**
 * Upsert des candidatures aux sénatoriales 2026 (pré-scrutin, listes du
 * ministère de l'Intérieur via `sources/senat-candidacies-2026.ts`), appelé
 * par `run-senat-candidacies.ts` (`ingest:senat:candidacies`).
 *
 * Tables écrites : `senatorial_elections` (une ligne par département,
 * round 1) et `senatorial_candidates`.
 *
 * Clés de rapprochement (ON CONFLICT) :
 * - élection : (election_year, departement_code, round) ;
 * - candidat : (election_id, nom, prenom).
 * Rattachement candidat → `officials` par nom + prénom normalisés (pas de date
 * de naissance dans la source) : approximatif, réécrit à chaque passage.
 *
 * Idempotent : tout est réécrit ; les résultats chiffrés (inscrits, votants)
 * ne sont pas touchés ici, ils arrivent par `upsert/senatorial-elections.ts`.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  officials,
  senatorialElections,
  senatorialCandidates,
} from '@elupedia/shared';
import type { SenatorialCandidacyDepartement } from '../sources/senat-candidacies-2026.js';
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

// Candidature pré-scrutin : round=1 par convention, en attendant le
// résultat réel (avec un éventuel second tour en majoritaire, connu
// seulement après le premier). Cible la même clé unique que l'ingestion
// rétrospective des résultats (upsert/senatorial-elections.ts), qui la
// complètera avec inscrits/votants/etc. une fois le scrutin passé.
const CANDIDACY_ROUND = 1;

/**
 * Upsert des candidatures par département. Écrit dans `senatorial_elections`
 * et `senatorial_candidates`. Retourne des compteurs (circonscriptions,
 * candidats, candidats rattachés à une fiche).
 */
export async function upsertSenatorialCandidacies(
  db: NeonHttpDatabase,
  departements: SenatorialCandidacyDepartement[],
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
    const [election] = await db
      .insert(senatorialElections)
      .values({
        electionYear: departement.electionYear,
        departementCode: departement.departementCode,
        departementName: departement.departementName,
        scrutinType: departement.scrutinType,
        round: CANDIDACY_ROUND,
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

    for (const candidate of departement.candidates) {
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
          sortant: candidate.sortant,
          officialId,
        })
        .onConflictDoUpdate({
          target: [
            senatorialCandidates.electionId,
            senatorialCandidates.nom,
            senatorialCandidates.prenom,
          ],
          set: {
            nuance: candidate.nuance,
            liste: candidate.liste,
            sortant: candidate.sortant,
            officialId,
            updatedAt: new Date(),
          },
        });

      summary.candidates++;
    }
  }

  logger.info(
    `Senatorial candidacies 2026: ${summary.elections} circonscriptions, ${summary.candidates} candidats, ${summary.matched} rattachés à une fiche`,
  );
  return summary;
}
