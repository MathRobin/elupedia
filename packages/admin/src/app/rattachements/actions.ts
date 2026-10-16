'use server';

/**
 * Rattachement manuel des enregistrements que l'ingestion n'a pas su relier
 * à une fiche élu : parrainages présidentiels et signatures RIP
 * (`sponsorships.official_id` nul), candidats aux sénatoriales
 * (`senatorial_candidates.official_id` nul). On cherche une fiche par nom,
 * on confirme, et `official_id` est renseigné (avec `matched = true` pour les
 * parrainages). Ouvert aux modérateurs.
 */
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import {
  createDb,
  officials,
  mandates,
  sponsorships,
  senatorialCandidates,
  senatorialElections,
} from '@elupedia/shared';
import { auth } from '@/lib/auth';

const db = createDb();

async function requireAuthenticatedUser() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!role || (role !== 'admin' && role !== 'moderator'))
    throw new Error('Forbidden');
}

/** Écrire un `official_id` engage la fiche publique : rôle admin seul. */
async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== 'admin') throw new Error('Forbidden');
}

export interface UnresolvedSummary {
  sponsorships: { type: string; electionYear: number; count: number }[];
  senatorialCandidates: { electionYear: string; count: number }[];
}

export async function unresolvedSummary(): Promise<UnresolvedSummary> {
  await requireAuthenticatedUser();
  const sp = await db
    .select({
      type: sponsorships.type,
      electionYear: sponsorships.electionYear,
      count: sql<number>`count(*)::int`,
    })
    .from(sponsorships)
    .where(isNull(sponsorships.officialId))
    .groupBy(sponsorships.type, sponsorships.electionYear)
    .orderBy(desc(sponsorships.electionYear));
  const sc = await db
    .select({
      electionYear: senatorialElections.electionYear,
      count: sql<number>`count(*)::int`,
    })
    .from(senatorialCandidates)
    .innerJoin(
      senatorialElections,
      eq(senatorialElections.id, senatorialCandidates.electionId),
    )
    .where(isNull(senatorialCandidates.officialId))
    .groupBy(senatorialElections.electionYear)
    .orderBy(desc(senatorialElections.electionYear));
  return { sponsorships: sp, senatorialCandidates: sc };
}

export interface UnresolvedRow {
  kind: 'sponsorship' | 'senatorial_candidate';
  id: string;
  name: string;
  detail: string;
  context: string;
}

export async function listUnresolved(
  kind: UnresolvedRow['kind'],
  year: string,
  query: string,
  limit = 50,
): Promise<UnresolvedRow[]> {
  await requireAuthenticatedUser();
  const q = query.trim();
  if (kind === 'sponsorship') {
    const rows = await db
      .select({
        id: sponsorships.id,
        name: sponsorships.rawElectedName,
        fn: sponsorships.rawFunction,
        circ: sponsorships.rawCircumscription,
        dep: sponsorships.rawDepartment,
        candidate: sponsorships.candidateName,
        type: sponsorships.type,
      })
      .from(sponsorships)
      .where(
        and(
          isNull(sponsorships.officialId),
          eq(sponsorships.electionYear, Number(year)),
          q ? ilike(sponsorships.rawElectedName, `%${q}%`) : undefined,
        ),
      )
      .orderBy(asc(sponsorships.rawElectedName))
      .limit(limit);
    return rows.map((r) => ({
      kind: 'sponsorship' as const,
      id: r.id,
      name: r.name,
      detail: [r.fn, r.circ, r.dep].filter(Boolean).join(' · '),
      context:
        r.type === 'rip_signature'
          ? `Signature RIP ${year}`
          : `Parrainage ${year} → ${r.candidate ?? '?'}`,
    }));
  }
  const rows = await db
    .select({
      id: senatorialCandidates.id,
      nom: senatorialCandidates.nom,
      prenom: senatorialCandidates.prenom,
      nuance: senatorialCandidates.nuance,
      dep: senatorialElections.departementCode,
    })
    .from(senatorialCandidates)
    .innerJoin(
      senatorialElections,
      eq(senatorialElections.id, senatorialCandidates.electionId),
    )
    .where(
      and(
        isNull(senatorialCandidates.officialId),
        eq(senatorialElections.electionYear, year),
        q
          ? or(
              ilike(senatorialCandidates.nom, `%${q}%`),
              ilike(senatorialCandidates.prenom, `%${q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(asc(senatorialCandidates.nom))
    .limit(limit);
  return rows.map((r) => ({
    kind: 'senatorial_candidate' as const,
    id: r.id,
    name: `${r.prenom} ${r.nom}`,
    detail: [r.nuance, r.dep ? `dép. ${r.dep}` : null]
      .filter(Boolean)
      .join(' · '),
    context: `Sénatoriales ${year}`,
  }));
}

export interface OfficialHit {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  slug: string | null;
  mandates: string[];
}

/** Recherche d'une fiche par nom (et prénom), avec ses mandats pour lever les homonymies. */
export async function searchOfficials(
  query: string,
  limit = 15,
): Promise<OfficialHit[]> {
  await requireAuthenticatedUser();
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const conds = words.map((w) =>
    or(
      ilike(officials.lastName, `%${w}%`),
      ilike(officials.firstName, `%${w}%`),
    ),
  );
  const rows = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      birthDate: officials.birthDate,
      slug: officials.slug,
    })
    .from(officials)
    .where(and(...conds))
    .orderBy(asc(officials.lastName), asc(officials.firstName))
    .limit(limit);
  if (rows.length === 0) return [];
  const ms = await db
    .select({
      officialId: mandates.officialId,
      type: mandates.type,
      department: mandates.department,
      district: mandates.district,
      endDate: mandates.endDate,
    })
    .from(mandates)
    .where(sql`${mandates.officialId} in ${rows.map((r) => r.id)}`);
  return rows.map((r) => ({
    ...r,
    mandates: ms
      .filter((m) => m.officialId === r.id)
      .map(
        (m) =>
          `${m.type}${m.district ? ` ${m.district}` : ''}${m.department ? ` (${m.department})` : ''}${m.endDate ? ` jusqu'au ${m.endDate}` : ''}`,
      ),
  }));
}

export async function attachToOfficial(
  kind: UnresolvedRow['kind'],
  id: string,
  officialId: string,
): Promise<void> {
  await requireAdmin();
  if (kind === 'sponsorship') {
    await db
      .update(sponsorships)
      .set({ officialId, matched: true })
      .where(and(eq(sponsorships.id, id), isNull(sponsorships.officialId)));
  } else {
    await db
      .update(senatorialCandidates)
      .set({ officialId })
      .where(
        and(
          eq(senatorialCandidates.id, id),
          isNull(senatorialCandidates.officialId),
        ),
      );
  }
}
