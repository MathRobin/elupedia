import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.js';
import {
  officials,
  mandates,
  legislativeElections,
  legislativeCandidates,
} from '@elupedia/shared';
import { eq, or, and, isNull, isNotNull, desc, inArray } from 'drizzle-orm';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const { code } = params;

  if (!code || !/^\d{5}$/.test(code)) {
    return Response.redirect('https://www.elupedia.fr/docs/commune-api', 302);
  }

  const db = getDb();

  const communeRows = await db
    .selectDistinctOn([officials.id], {
      slug: officials.slug,
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      mandateType: mandates.type,
      politicalGroup: mandates.politicalGroup,
    })
    .from(mandates)
    .innerJoin(officials, eq(mandates.officialId, officials.id))
    .where(
      and(
        or(
          eq(mandates.communeCode, code),
          eq(mandates.parentCommuneCode, code),
        ),
        isNull(mandates.endDate),
      ),
    );

  const [lastElection] = await db
    .select({ id: legislativeElections.id })
    .from(legislativeElections)
    .where(eq(legislativeElections.communeCode, code))
    .orderBy(desc(legislativeElections.electionDate))
    .limit(1);

  let deputeRows: typeof communeRows = [];

  if (lastElection) {
    const candidateOfficialIds = await db
      .select({ officialId: legislativeCandidates.officialId })
      .from(legislativeCandidates)
      .where(
        and(
          eq(legislativeCandidates.electionId, lastElection.id),
          isNotNull(legislativeCandidates.officialId),
        ),
      );

    const ids = candidateOfficialIds
      .map((c) => c.officialId)
      .filter((id): id is string => id !== null);

    if (ids.length > 0) {
      deputeRows = await db
        .selectDistinctOn([officials.id], {
          slug: officials.slug,
          id: officials.id,
          firstName: officials.firstName,
          lastName: officials.lastName,
          mandateType: mandates.type,
          politicalGroup: mandates.politicalGroup,
        })
        .from(mandates)
        .innerJoin(officials, eq(mandates.officialId, officials.id))
        .where(
          and(
            inArray(mandates.officialId, ids),
            eq(mandates.type, 'depute'),
            isNull(mandates.endDate),
          ),
        );
    }
  }

  const seenIds = new Set(communeRows.map((r) => r.id));
  const allRows = [...communeRows];
  for (const r of deputeRows) {
    if (!seenIds.has(r.id)) {
      allRows.push(r);
      seenIds.add(r.id);
    }
  }

  const baseUrl = 'https://www.elupedia.fr';

  const result = allRows.map((r) => ({
    url: `${baseUrl}/elus/${r.slug ?? r.id}`,
    firstName: r.firstName,
    lastName: r.lastName,
    mandateType: r.mandateType,
    politicalGroup: r.politicalGroup,
  }));

  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
