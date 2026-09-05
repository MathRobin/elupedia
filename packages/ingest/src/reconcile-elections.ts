import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { eq, isNull, sql } from 'drizzle-orm';
import {
  officials,
  municipalCandidates,
  legislativeCandidates,
  senatorialCandidates,
} from '@elupedia/shared';
import { logger } from './logger.js';

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

type CandidateTable =
  | typeof municipalCandidates
  | typeof legislativeCandidates
  | typeof senatorialCandidates;

async function reconcileTable(
  db: NeonHttpDatabase,
  table: CandidateTable,
  label: string,
  officialByName: Map<string, string>,
): Promise<{ updated: number; total: number }> {
  const unlinked = await db
    .select({
      id: table.id,
      nom: table.nom,
      prenom: table.prenom,
    })
    .from(table)
    .where(isNull(table.officialId));

  let updated = 0;

  for (const c of unlinked) {
    const key = `${normalize(c.nom)}|${normalize(c.prenom)}`;
    const officialId = officialByName.get(key);
    if (!officialId) continue;

    await db
      .update(table)
      .set({ officialId, updatedAt: new Date() })
      .where(eq(table.id, c.id));
    updated++;
  }

  logger.info(`  ${label}: ${updated} linked / ${unlinked.length} unlinked`);
  return { updated, total: unlinked.length };
}

export async function reconcileElections(db: NeonHttpDatabase) {
  logger.info('=== Election candidate reconciliation ===\n');

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

  logger.info(`${officialByName.size} officials loaded for matching\n`);

  const muni = await reconcileTable(
    db,
    municipalCandidates,
    'Municipal',
    officialByName,
  );
  const legi = await reconcileTable(
    db,
    legislativeCandidates,
    'Legislative',
    officialByName,
  );
  const sena = await reconcileTable(
    db,
    senatorialCandidates,
    'Senatorial',
    officialByName,
  );

  const totalUpdated = muni.updated + legi.updated + sena.updated;

  const counts = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM municipal_candidates WHERE official_id IS NOT NULL) as muni_linked,
      (SELECT COUNT(*) FROM municipal_candidates) as muni_total,
      (SELECT COUNT(*) FROM legislative_candidates WHERE official_id IS NOT NULL) as legi_linked,
      (SELECT COUNT(*) FROM legislative_candidates) as legi_total,
      (SELECT COUNT(*) FROM senatorial_candidates WHERE official_id IS NOT NULL) as sena_linked,
      (SELECT COUNT(*) FROM senatorial_candidates) as sena_total
  `);

  const row = counts.rows[0];
  logger.info(`\n=== Summary ===`);
  logger.info(`Newly linked: ${totalUpdated}`);
  logger.info(
    `Municipal:    ${row.muni_linked}/${row.muni_total} linked (${((Number(row.muni_linked) / Number(row.muni_total)) * 100).toFixed(1)}%)`,
  );
  logger.info(
    `Legislative:  ${row.legi_linked}/${row.legi_total} linked (${((Number(row.legi_linked) / Number(row.legi_total)) * 100).toFixed(1)}%)`,
  );
  logger.info(
    `Senatorial:   ${row.sena_linked}/${row.sena_total} linked (${((Number(row.sena_linked) / Number(row.sena_total)) * 100).toFixed(1)}%)`,
  );

  return { totalUpdated, muni, legi, sena };
}
