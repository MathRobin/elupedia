import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  officials,
  senatorialElections,
  senatorialCandidates,
} from '@elupedia/shared';
import type { SenatorialCandidacyDepartement } from '../sources/senat-candidacies-2026.js';
import { logger } from '../logger.js';

function normalize(s: string): string {
  return s
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
  for (const o of allOfficials) {
    const key = `${normalize(o.lastName)}|${normalize(o.firstName)}`;
    officialByName.set(key, o.id);
  }

  for (const d of departements) {
    const [election] = await db
      .insert(senatorialElections)
      .values({
        electionYear: d.electionYear,
        departementCode: d.departementCode,
        departementName: d.departementName,
        scrutinType: d.scrutinType,
        round: CANDIDACY_ROUND,
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

    for (const c of d.candidates) {
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
          sortant: c.sortant,
          officialId,
        })
        .onConflictDoUpdate({
          target: [
            senatorialCandidates.electionId,
            senatorialCandidates.nom,
            senatorialCandidates.prenom,
          ],
          set: {
            nuance: c.nuance,
            liste: c.liste,
            sortant: c.sortant,
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
