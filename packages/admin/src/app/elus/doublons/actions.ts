'use server';

import { eq, sql, getTableName } from 'drizzle-orm';
import {
  createDb,
  officials,
  mandates,
  votes,
  staffers,
  affiliations,
  interests,
  addresses,
  externalLinks,
  pressMentions,
  parliamentaryActivity,
  committees,
  electoralResults,
  campaignAccounts,
  declarationSnapshots,
  sponsorships,
} from '@elupedia/shared';
import { auth } from '@/lib/auth';

const db = createDb();

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== 'admin') {
    throw new Error('Forbidden');
  }
}

export interface DuplicateGroup {
  firstName: string;
  lastName: string;
  department: string;
  ids: string[];
}

export async function countDuplicates(): Promise<number> {
  await requireAdmin();

  const rows = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM (
      SELECT 1
      FROM (
        SELECT DISTINCT o.id, o.first_name, o.last_name, m.department
        FROM officials o
        INNER JOIN mandates m ON m.official_id = o.id
        WHERE m.department IS NOT NULL
      ) sub
      GROUP BY first_name, last_name, department
      HAVING COUNT(*) > 1
    ) groups
  `);

  return rows.rows[0]?.count ?? 0;
}

export async function listDuplicates(): Promise<DuplicateGroup[]> {
  await requireAdmin();

  const rows = await db.execute<{
    first_name: string;
    last_name: string;
    department: string;
    ids: string[];
  }>(sql`
    SELECT first_name, last_name, department, array_agg(id ORDER BY updated_at ASC) AS ids
    FROM (
      SELECT DISTINCT o.id, o.first_name, o.last_name, m.department, o.updated_at
      FROM officials o
      INNER JOIN mandates m ON m.official_id = o.id
      WHERE m.department IS NOT NULL
    ) sub
    GROUP BY first_name, last_name, department
    HAVING COUNT(*) > 1
    ORDER BY last_name, first_name
  `);

  return rows.rows.map((r) => ({
    firstName: r.first_name,
    lastName: r.last_name,
    department: r.department,
    ids: r.ids,
  }));
}

const CHILD_TABLES = [
  mandates,
  votes,
  staffers,
  affiliations,
  interests,
  addresses,
  externalLinks,
  pressMentions,
  parliamentaryActivity,
  committees,
  electoralResults,
  campaignAccounts,
  declarationSnapshots,
  sponsorships,
] as const;

interface OfficialDetail {
  id: string;
  firstName: string;
  lastName: string;
  anId: string | null;
  senatId: string | null;
  birthDate: string | null;
  photoUrl: string | null;
  deathDate: string | null;
  slug: string | null;
  updatedAt: Date;
  counts: Record<string, number>;
}

export async function getDuplicateDetails(
  ids: string[],
): Promise<OfficialDetail[]> {
  await requireAdmin();

  const details: OfficialDetail[] = [];

  for (const id of ids) {
    const [row] = await db
      .select()
      .from(officials)
      .where(eq(officials.id, id))
      .limit(1);

    if (!row) continue;

    const counts: Record<string, number> = {};
    for (const table of CHILD_TABLES) {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(table)
        .where(eq(table.officialId, id));
      counts[getTableName(table)] = result?.count ?? 0;
    }

    details.push({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      anId: row.anId,
      senatId: row.senatId,
      birthDate: row.birthDate,
      photoUrl: row.photoUrl,
      deathDate: row.deathDate,
      slug: row.slug,
      updatedAt: row.updatedAt,
      counts,
    });
  }

  return details;
}

export async function mergeOfficials(
  keepId: string,
  removeId: string,
): Promise<void> {
  await requireAdmin();

  const [keep] = await db
    .select()
    .from(officials)
    .where(eq(officials.id, keepId))
    .limit(1);
  const [remove] = await db
    .select()
    .from(officials)
    .where(eq(officials.id, removeId))
    .limit(1);

  if (!keep || !remove) throw new Error('Official not found');

  for (const table of CHILD_TABLES) {
    await db
      .update(table)
      .set({ officialId: keepId })
      .where(eq(table.officialId, removeId));
  }

  await db
    .update(officials)
    .set({ anId: null, senatId: null, slug: null })
    .where(eq(officials.id, removeId));

  await db
    .update(officials)
    .set({
      anId: keep.anId ?? remove.anId,
      senatId: keep.senatId ?? remove.senatId,
      birthDate: keep.birthDate ?? remove.birthDate,
      photoUrl: keep.photoUrl ?? remove.photoUrl,
      deathDate: keep.deathDate ?? remove.deathDate,
      slug: keep.slug ?? remove.slug,
      updatedAt: new Date(),
    })
    .where(eq(officials.id, keepId));

  await db.delete(officials).where(eq(officials.id, removeId));
}
