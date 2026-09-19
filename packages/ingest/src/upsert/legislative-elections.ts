import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import {
  officials,
  legislativeElections,
  legislativeCandidates,
} from '@elupedia/shared';
import type { LegislativeGeneralResult } from '../sources/legislative-elections.js';
import { logger } from '../logger.js';

const CANDIDATE_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

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

    const insertedElections = await db
      .insert(legislativeElections)
      .values(
        batch.map((r) => ({
          electionId: r.electionId,
          departementCode: r.departementCode,
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

    summary.elections += insertedElections.length;

    const electionIdByKey = new Map<string, string>();
    for (const e of insertedElections) {
      electionIdByKey.set(`${e.electionId}|${e.communeCode}`, e.id);
    }

    const candidateRows: (typeof legislativeCandidates.$inferInsert)[] = [];
    for (const r of batch) {
      const electionId = electionIdByKey.get(
        `${r.electionId}|${r.communeCode}`,
      );
      if (!electionId) continue;

      for (const c of r.candidates) {
        const officialKey = `${normalize(c.nom)}|${normalize(c.prenom)}`;
        const officialId = officialByName.get(officialKey) ?? null;
        if (officialId) summary.matched++;

        candidateRows.push({
          electionId,
          panneau: c.panneau,
          nom: c.nom,
          prenom: c.prenom,
          sexe: c.sexe,
          nuance: c.nuance,
          voix: c.voix,
          ratioInscrits: c.ratioInscrits,
          ratioExprimes: c.ratioExprimes,
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
