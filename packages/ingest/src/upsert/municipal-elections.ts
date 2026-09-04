import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  officials,
  municipalElections,
  municipalCandidates,
} from '@elupedia/shared';
import type { MunicipalGeneralResult } from '../sources/municipal-elections.js';
import { logger } from '../logger.js';

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

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
  for (const o of allOfficials) {
    const key = `${normalize(o.lastName)}|${normalize(o.firstName)}`;
    officialByName.set(key, o.id);
  }

  logger.info(`  ${officialByName.size} officials loaded for matching`);

  const BATCH = 200;
  const totalBatches = Math.ceil(results.length / BATCH);

  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    if (batchNum % 50 === 1) {
      logger.info(`  Processing batch ${batchNum}/${totalBatches}`);
    }

    for (const r of batch) {
      const [election] = await db
        .insert(municipalElections)
        .values({
          electionId: r.electionId,
          communeCode: r.communeCode,
          communeName: r.communeName,
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
            municipalElections.electionId,
            municipalElections.communeCode,
          ],
          set: {
            communeName: r.communeName,
            round: r.round,
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
        .returning({ id: municipalElections.id });

      summary.elections++;

      for (const c of r.candidates) {
        const officialKey = `${normalize(c.nom)}|${normalize(c.prenom)}`;
        const officialId = officialByName.get(officialKey) ?? null;
        if (officialId) summary.matched++;

        await db
          .insert(municipalCandidates)
          .values({
            electionId: election.id,
            panneau: c.panneau,
            nom: c.nom,
            prenom: c.prenom,
            sexe: c.sexe,
            nuance: c.nuance,
            liste: c.liste,
            voix: c.voix,
            ratioInscrits: c.ratioInscrits,
            ratioExprimes: c.ratioExprimes,
            officialId,
          })
          .onConflictDoUpdate({
            target: [
              municipalCandidates.electionId,
              municipalCandidates.panneau,
            ],
            set: {
              nom: c.nom,
              prenom: c.prenom,
              sexe: c.sexe,
              nuance: c.nuance,
              liste: c.liste,
              voix: c.voix,
              ratioInscrits: c.ratioInscrits,
              ratioExprimes: c.ratioExprimes,
              officialId,
              updatedAt: new Date(),
            },
          });

        summary.candidates++;
      }
    }
  }

  logger.info(
    `Municipal elections: ${summary.elections} elections, ${summary.candidates} candidates, ${summary.matched} matched to officials`,
  );
  return summary;
}
