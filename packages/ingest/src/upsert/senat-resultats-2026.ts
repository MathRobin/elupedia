import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  officials,
  senatorialElections,
  senatorialCandidates,
} from '@elupedia/shared';
import type { SenatorialResultDepartement } from '../sources/senat-resultats-2026.js';
import { logger } from '../logger.js';

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

// Complète les lignes créées par l'ingestion des candidatures (round=1,
// voir upsert/senat-candidacies.ts) avec les résultats réels une fois le
// scrutin dépouillé, et crée les lignes round=2 pour les rares départements
// majoritaires où un second tour a eu lieu (ex. Guyane). Cible la même clé
// unique (electionYear, departementCode, round) que les deux autres
// ingestions sénatoriales 2026.
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
  for (const o of allOfficials) {
    const key = `${normalize(o.lastName)}|${normalize(o.firstName)}`;
    officialByName.set(key, o.id);
  }

  for (const d of departements) {
    for (const round of d.rounds) {
      const [election] = await db
        .insert(senatorialElections)
        .values({
          electionYear: d.electionYear,
          departementCode: d.departementCode,
          departementName: d.departementName,
          scrutinType: d.scrutinType,
          round: round.round,
          electionDate: d.electionDate,
          siegesAPourvoir: d.siegesAPourvoir,
          electeursSenatoriaux: d.electeursSenatoriaux,
        })
        .onConflictDoUpdate({
          target: [
            senatorialElections.electionYear,
            senatorialElections.departementCode,
            senatorialElections.round,
          ],
          set: {
            departementName: d.departementName,
            scrutinType: d.scrutinType,
            electionDate: d.electionDate,
            siegesAPourvoir: d.siegesAPourvoir,
            electeursSenatoriaux: d.electeursSenatoriaux,
            updatedAt: new Date(),
          },
        })
        .returning({ id: senatorialElections.id });

      summary.elections++;

      for (const c of round.candidates) {
        const officialKey = `${normalize(c.nom)}|${normalize(c.prenom)}`;
        const officialId = officialByName.get(officialKey) ?? null;
        if (officialId) summary.matched++;

        await db
          .insert(senatorialCandidates)
          .values({
            electionId: election.id,
            nom: c.nom,
            prenom: c.prenom,
            nuance: c.nuance,
            liste: c.liste,
            voix: c.voix,
            ratioExprimes: c.ratioExprimes,
            elected: c.elected,
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
              nuance: c.nuance,
              liste: c.liste,
              voix: c.voix,
              ratioExprimes: c.ratioExprimes,
              elected: c.elected,
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
