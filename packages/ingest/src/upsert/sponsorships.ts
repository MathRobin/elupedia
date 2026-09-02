import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, sponsorships } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { ParrainageRow } from '../sources/parrainages.js';
import { logger } from '../logger.js';

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

async function buildOfficialCache(
  db: NeonHttpDatabase,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials);

  const cache = new Map<string, string>();
  for (const row of rows) {
    const key = `${normalize(row.lastName)}|${normalize(row.firstName)}`;
    cache.set(key, row.id);
  }
  return cache;
}

async function buildExistingCache(
  db: NeonHttpDatabase,
  electionYear: number,
  type: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ rawElectedName: sponsorships.rawElectedName })
    .from(sponsorships)
    .where(
      and(
        eq(sponsorships.type, type),
        eq(sponsorships.electionYear, electionYear),
      ),
    );
  return new Set(rows.map((r) => r.rawElectedName));
}

function matchOfficial(
  row: ParrainageRow,
  cache: Map<string, string>,
): string | null {
  const key = `${normalize(row.nom)}|${normalize(row.prenom)}`;
  return cache.get(key) ?? null;
}

const BATCH_SIZE = 500;

export async function upsertSponsorships(
  db: NeonHttpDatabase,
  rows: ParrainageRow[],
  electionYear: number,
  type: string = 'parrainage_presidentiel',
): Promise<{ created: number; updated: number; matched: number }> {
  const officialCache = await buildOfficialCache(db);
  const existingNames = await buildExistingCache(db, electionYear, type);
  let created = 0;
  let skipped = 0;
  let matched = 0;

  const toInsert: (typeof sponsorships.$inferInsert)[] = [];

  for (const row of rows) {
    const officialId = matchOfficial(row, officialCache);
    if (officialId) matched++;

    const rawName = `${row.nom} ${row.prenom}`;

    if (existingNames.has(rawName)) {
      skipped++;
      continue;
    }

    toInsert.push({
      officialId,
      type,
      electionYear,
      candidateName: row.candidat,
      rawElectedName: rawName,
      rawFunction: row.mandat,
      rawCircumscription: row.circonscription || null,
      rawDepartment: row.departement || null,
      publicationDate: row.datePublication || null,
      matched: !!officialId,
    });
  }

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    await db.insert(sponsorships).values(batch);
    created += batch.length;
    logger.info(
      `[Parrainages] ${electionYear}: inserted ${Math.min(i + BATCH_SIZE, toInsert.length)}/${toInsert.length}`,
    );
  }

  logger.info(
    `[Parrainages] ${electionYear}: ${created} created, ${skipped} skipped (existing), ${matched}/${rows.length} matched`,
  );
  return { created, updated: skipped, matched };
}
