import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  officials,
  senatorialElections,
  senatorialCandidates,
} from '@elupedia/shared';
import type { SenatorialDepartementResult } from '../sources/senat-elections.js';
import { logger } from '../logger.js';

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

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
  for (const o of allOfficials) {
    const key = `${normalize(o.lastName)}|${normalize(o.firstName)}`;
    officialByName.set(key, o.id);
  }

  logger.info(`  ${officialByName.size} officials loaded for matching`);

  for (const r of results) {
    const [election] = await db
      .insert(senatorialElections)
      .values({
        electionYear: r.electionYear,
        departementCode: r.departementCode,
        departementName: r.departementName,
        scrutinType: r.scrutinType,
        round: r.round,
        electionDate: r.electionDate,
        inscrits: r.inscrits,
        abstentions: r.abstentions,
        votants: r.votants,
        blancs: r.blancs,
        nuls: r.nuls,
        exprimes: r.exprimes,
      })
      .onConflictDoUpdate({
        target: [
          senatorialElections.electionYear,
          senatorialElections.departementCode,
          senatorialElections.round,
        ],
        set: {
          departementName: r.departementName,
          scrutinType: r.scrutinType,
          electionDate: r.electionDate,
          inscrits: r.inscrits,
          abstentions: r.abstentions,
          votants: r.votants,
          blancs: r.blancs,
          nuls: r.nuls,
          exprimes: r.exprimes,
          updatedAt: new Date(),
        },
      })
      .returning({ id: senatorialElections.id });

    summary.elections++;

    for (const c of r.candidates) {
      const officialKey = `${normalize(c.nom)}|${normalize(c.prenom)}`;
      const officialId = officialByName.get(officialKey) ?? null;
      if (officialId) summary.matched++;

      await db
        .insert(senatorialCandidates)
        .values({
          electionId: election.id,
          nom: c.nom,
          prenom: c.prenom,
          sexe: c.sexe,
          nuance: c.nuance,
          voix: c.voix,
          ratioExprimes: c.scorePercent,
          elected: c.elected,
          officialId,
        })
        .onConflictDoUpdate({
          target: [
            senatorialCandidates.electionId,
            senatorialCandidates.nom,
            senatorialCandidates.prenom,
          ],
          set: {
            sexe: c.sexe,
            nuance: c.nuance,
            voix: c.voix,
            ratioExprimes: c.scorePercent,
            elected: c.elected,
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
