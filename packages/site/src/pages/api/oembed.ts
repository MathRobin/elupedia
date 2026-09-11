import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db.js';
import { officials, mandates, ballots } from '@elupedia/shared';
import { eq, or } from 'drizzle-orm';

export const prerender = false;

const SITE = 'https://www.elupedia.fr';

const MANDATE_LABELS: Record<string, string> = {
  depute: 'Député',
  senateur: 'Sénateur',
  maire: 'Maire',
  president: 'Président',
};

type OEmbedResponse = {
  type: string;
  version: string;
  title: string;
  author_name?: string;
  provider_name: string;
  provider_url: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  html?: string;
  width?: number;
  height?: number;
};

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data: OEmbedResponse, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      ...corsHeaders(),
    },
  });
}

function xmlResponse(data: OEmbedResponse, status = 200): Response {
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const fields = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `  <${k}>${escape(String(v))}</${k}>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<oembed>\n${fields}\n</oembed>`;

  return new Response(xml, {
    status,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      ...corsHeaders(),
    },
  });
}

function respond(data: OEmbedResponse, format: string, status = 200): Response {
  return format === 'xml'
    ? xmlResponse(data, status)
    : jsonResponse(data, status);
}

function parseUrl(
  raw: string,
): { type: 'official'; slug: string } | { type: 'scrutin'; id: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.origin !== SITE) return null;
  const path = parsed.pathname;

  const officialMatch = path.match(/^\/elus\/([^/]+)$/);
  if (officialMatch) return { type: 'official', slug: officialMatch[1] };

  const scrutinMatch = path.match(/^\/scrutins\/([^/]+)$/);
  if (scrutinMatch) return { type: 'scrutin', id: scrutinMatch[1] };

  return null;
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() });
};

export const GET: APIRoute = async ({ url }) => {
  const rawUrl = url.searchParams.get('url');
  const format = url.searchParams.get('format') ?? 'json';

  if (format !== 'json' && format !== 'xml') {
    return new Response('Unsupported format', {
      status: 501,
      headers: corsHeaders(),
    });
  }

  if (!rawUrl) {
    return new Response('Missing url parameter', {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const parsed = parseUrl(rawUrl);
  if (!parsed) {
    return new Response('URL not supported', {
      status: 404,
      headers: corsHeaders(),
    });
  }

  const db = getDb();

  if (parsed.type === 'official') {
    const { slug } = parsed;
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        slug,
      );
    const filter = isUuid
      ? or(eq(officials.slug, slug), eq(officials.id, slug))
      : eq(officials.slug, slug);

    const rows = await db
      .select({
        slug: officials.slug,
        id: officials.id,
        firstName: officials.firstName,
        lastName: officials.lastName,
        photoUrl: officials.s3PhotoUrl,
        fallbackPhoto: officials.photoUrl,
        mandateType: mandates.type,
        politicalGroup: mandates.politicalGroup,
        district: mandates.district,
        department: mandates.department,
        endDate: mandates.endDate,
      })
      .from(officials)
      .innerJoin(mandates, eq(mandates.officialId, officials.id))
      .where(filter)
      .limit(10);

    const row = rows.find((r) => !r.endDate) ?? rows[0];
    if (!row)
      return new Response('Not found', { status: 404, headers: corsHeaders() });

    const fullName = `${row.firstName} ${row.lastName}`;
    const mandate = MANDATE_LABELS[row.mandateType] ?? row.mandateType;
    const location = [row.district, row.department].filter(Boolean).join(' — ');
    const slug2 = row.slug ?? row.id;
    const ogUrl = `${SITE}/api/og/official/${slug2}.png`;

    return respond(
      {
        type: 'rich',
        version: '1.0',
        title: `${fullName} — ${mandate}${location ? ` — ${location}` : ''}`,
        author_name: fullName,
        provider_name: 'Elupedia',
        provider_url: SITE,
        thumbnail_url: ogUrl,
        thumbnail_width: 1200,
        thumbnail_height: 630,
        html: `<iframe src="${SITE}/elus/${slug2}" width="600" height="400" frameborder="0" allowfullscreen></iframe>`,
        width: 600,
        height: 400,
      },
      format,
    );
  }

  if (parsed.type === 'scrutin') {
    const { id } = parsed;

    const [ballot] = await db
      .select({
        id: ballots.id,
        title: ballots.title,
        date: ballots.date,
        type: ballots.type,
      })
      .from(ballots)
      .where(eq(ballots.id, id))
      .limit(1);

    if (!ballot)
      return new Response('Not found', { status: 404, headers: corsHeaders() });

    const dateFormatted = new Date(ballot.date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const ogUrl = `${SITE}/api/og/scrutin/${ballot.id}.png`;

    return respond(
      {
        type: 'rich',
        version: '1.0',
        title: `${ballot.title} — ${dateFormatted}`,
        provider_name: 'Elupedia',
        provider_url: SITE,
        thumbnail_url: ogUrl,
        thumbnail_width: 1200,
        thumbnail_height: 630,
        html: `<iframe src="${SITE}/scrutins/${ballot.id}" width="600" height="400" frameborder="0" allowfullscreen></iframe>`,
        width: 600,
        height: 400,
      },
      format,
    );
  }

  return new Response('Not found', { status: 404, headers: corsHeaders() });
};
