'use server';

/**
 * Fiches élus dans l'admin : recherche par nom, lecture d'une fiche avec ses
 * mandats, et corrections manuelles limitées à des champs que l'ingestion
 * ne réécrit pas systématiquement (date de naissance, date de décès, photo,
 * fin d'un mandat). Chaque correction est tracée dans `data_provenance`
 * (source « Admin Elupedia », valeur avant/après, auteur). Réservé aux admins.
 *
 * Limite connue : l'ingestion reste la source de vérité ; une passe AN/Sénat
 * peut remettre une date de naissance ou une photo depuis sa source, et le
 * rapprochement de mandats peut rouvrir un mandat clos à la main si la
 * source le publie encore comme en cours. La trace de provenance permet au
 * moins de le constater.
 */
import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import {
  createDb,
  dataProvenance,
  mandates,
  officials,
} from '@elupedia/shared';
import { auth } from '@/lib/auth';

const db = createDb();

async function requireAdmin(): Promise<string> {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== 'admin') throw new Error('Forbidden');
  return session?.user?.email ?? 'admin';
}

async function requireAuthenticatedUser() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!role || (role !== 'admin' && role !== 'moderator'))
    throw new Error('Forbidden');
}

export interface OfficialSummary {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  deathDate: string | null;
  slug: string | null;
  currentMandates: string[];
}

export async function searchOfficialsDetailed(
  query: string,
  limit = 30,
): Promise<OfficialSummary[]> {
  await requireAuthenticatedUser();
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const rows = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      birthDate: officials.birthDate,
      deathDate: officials.deathDate,
      slug: officials.slug,
    })
    .from(officials)
    .where(
      and(
        ...words.map((w) =>
          or(
            ilike(officials.lastName, `%${w}%`),
            ilike(officials.firstName, `%${w}%`),
          ),
        ),
      ),
    )
    .orderBy(asc(officials.lastName), asc(officials.firstName))
    .limit(limit);
  const ids = rows.map((r) => r.id);
  const ms = ids.length
    ? await db
        .select({
          officialId: mandates.officialId,
          type: mandates.type,
          department: mandates.department,
          endDate: mandates.endDate,
        })
        .from(mandates)
        .where(and(or(...ids.map((id) => eq(mandates.officialId, id)))))
    : [];
  return rows.map((r) => ({
    ...r,
    currentMandates: ms
      .filter((m) => m.officialId === r.id && m.endDate === null)
      .map((m) => `${m.type}${m.department ? ` (${m.department})` : ''}`),
  }));
}

export interface MandateRow {
  id: string;
  type: string;
  district: string | null;
  department: string | null;
  politicalGroup: string | null;
  startDate: string;
  endDate: string | null;
}

export interface OfficialDetail {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  deathDate: string | null;
  photoUrl: string | null;
  s3PhotoUrl: string | null;
  slug: string | null;
  anId: string | null;
  senatId: string | null;
  europarlId: string | null;
  updatedAt: string;
  mandates: MandateRow[];
  corrections: {
    field: string;
    at: string;
    by: string;
    before: unknown;
    after: unknown;
  }[];
}

export async function getOfficial(id: string): Promise<OfficialDetail | null> {
  await requireAuthenticatedUser();
  const [o] = await db
    .select()
    .from(officials)
    .where(eq(officials.id, id))
    .limit(1);
  if (!o) return null;
  const ms = await db
    .select({
      id: mandates.id,
      type: mandates.type,
      district: mandates.district,
      department: mandates.department,
      politicalGroup: mandates.politicalGroup,
      startDate: mandates.startDate,
      endDate: mandates.endDate,
    })
    .from(mandates)
    .where(eq(mandates.officialId, id))
    .orderBy(desc(mandates.startDate));
  const prov = await db
    .select({
      rawData: dataProvenance.rawData,
      fetchedAt: dataProvenance.fetchedAt,
      sourceTable: dataProvenance.sourceTable,
    })
    .from(dataProvenance)
    .where(
      and(
        eq(dataProvenance.sourceName, ADMIN_SOURCE),
        or(
          eq(dataProvenance.sourceRecordId, id),
          ...ms.map((m) => eq(dataProvenance.sourceRecordId, m.id)),
        ),
      ),
    )
    .orderBy(desc(dataProvenance.fetchedAt));
  return {
    id: o.id,
    firstName: o.firstName,
    lastName: o.lastName,
    birthDate: o.birthDate,
    deathDate: o.deathDate,
    photoUrl: o.photoUrl,
    s3PhotoUrl: o.s3PhotoUrl,
    slug: o.slug,
    anId: o.anId,
    senatId: o.senatId,
    europarlId: o.europarlId,
    updatedAt: o.updatedAt.toISOString(),
    mandates: ms,
    corrections: prov.map((p) => {
      const d = (p.rawData ?? {}) as {
        field?: string;
        by?: string;
        before?: unknown;
        after?: unknown;
      };
      return {
        field: `${p.sourceTable}.${d.field ?? '?'}`,
        at: p.fetchedAt.toISOString(),
        by: d.by ?? '?',
        before: d.before,
        after: d.after,
      };
    }),
  };
}

const ADMIN_SOURCE = 'Admin Elupedia';

async function trace(
  sourceTable: string,
  recordId: string,
  field: string,
  before: unknown,
  after: unknown,
  by: string,
) {
  await db.insert(dataProvenance).values({
    sourceTable,
    sourceRecordId: recordId,
    sourceName: ADMIN_SOURCE,
    sourceUrl: '',
    legalBasis:
      "Correction manuelle par l'équipe (données publiques de mandat)",
    rawData: { field, before, after, by },
    fetchedAt: new Date(),
  });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function updateOfficialField(
  id: string,
  field: 'birthDate' | 'deathDate' | 'photoUrl',
  value: string,
): Promise<void> {
  const by = await requireAdmin();
  const v = value.trim() || null;
  if (
    (field === 'birthDate' || field === 'deathDate') &&
    v !== null &&
    !DATE.test(v)
  ) {
    throw new Error('Date attendue au format AAAA-MM-JJ');
  }
  if (field === 'photoUrl' && v !== null && !/^https?:\/\//.test(v)) {
    throw new Error('URL http(s) attendue');
  }
  const [before] = await db
    .select({
      birthDate: officials.birthDate,
      deathDate: officials.deathDate,
      photoUrl: officials.photoUrl,
    })
    .from(officials)
    .where(eq(officials.id, id))
    .limit(1);
  if (!before) throw new Error('Fiche introuvable');
  await db
    .update(officials)
    .set({ [field]: v, updatedAt: new Date() })
    .where(eq(officials.id, id));
  await trace('officials', id, field, before[field], v, by);
}

export async function endMandate(
  mandateId: string,
  endDate: string,
): Promise<void> {
  const by = await requireAdmin();
  if (!DATE.test(endDate))
    throw new Error('Date attendue au format AAAA-MM-JJ');
  const [m] = await db
    .select({ endDate: mandates.endDate, startDate: mandates.startDate })
    .from(mandates)
    .where(eq(mandates.id, mandateId))
    .limit(1);
  if (!m) throw new Error('Mandat introuvable');
  if (endDate < m.startDate)
    throw new Error('La fin ne peut pas précéder le début du mandat');
  await db
    .update(mandates)
    .set({ endDate, updatedAt: new Date() })
    .where(eq(mandates.id, mandateId));
  await trace('mandates', mandateId, 'endDate', m.endDate, endDate, by);
}

export async function reopenMandate(mandateId: string): Promise<void> {
  const by = await requireAdmin();
  const [m] = await db
    .select({ endDate: mandates.endDate })
    .from(mandates)
    .where(eq(mandates.id, mandateId))
    .limit(1);
  if (!m) throw new Error('Mandat introuvable');
  await db
    .update(mandates)
    .set({ endDate: null, updatedAt: new Date() })
    .where(eq(mandates.id, mandateId));
  await trace('mandates', mandateId, 'endDate', m.endDate, null, by);
}
