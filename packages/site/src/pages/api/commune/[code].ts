import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db.js';
import { officials, mandates } from '@elupedia/shared';
import { eq, or, and, isNull } from 'drizzle-orm';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const { code } = params;

  if (!code || !/^\d{5}$/.test(code)) {
    return new Response(
      JSON.stringify({ error: 'Invalid INSEE code — expected 5 digits' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const db = getDb();

  const rows = await db
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

  const baseUrl = 'https://www.elupedia.fr';

  const result = rows.map((r) => ({
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
