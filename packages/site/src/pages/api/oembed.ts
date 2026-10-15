/**
 * Endpoint oEmbed 1.0 : `GET /api/oembed?url=<URL Elupedia>&format=json|xml`.
 *
 * Transforme un lien vers une fiche élu (`/elus/{slug}`) ou un scrutin
 * (`/scrutins/{id}`) en carte riche : titre, vignette (image Open Graph de
 * `/api/og/*`) et `html` contenant une iframe vers `/elus/{slug}/embed` ou la
 * page du scrutin. Seules les URLs sur `https://www.elupedia.fr` sont acceptées.
 *
 * Consommateurs : les CMS (WordPress, Ghost…) via la balise
 * `<link rel="alternate" type="application/json+oembed">` posée par
 * `pages/elus/[slug]/index.astro` et `pages/scrutins/[id].astro`, la page
 * `/integrer` et la doc `/docs/oembed`.
 *
 * Réponses : 200 JSON ou XML (cache CDN 1 h, stale 24 h, CORS ouvert),
 * 400 sans `url`, 404 URL non supportée ou ressource absente, 501 format
 * inconnu. Le format d'erreur est du texte brut, pas du JSON.
 * `tests/oembed.test.js` vérifie des chaînes exactes de ce fichier.
 */
import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db.js';
import {
  officials,
  mandates,
  ballots,
  MANDATE_TYPE_LABELS,
} from '@elupedia/shared';
import { eq, or } from 'drizzle-orm';

export const prerender = false;

const SITE = 'https://www.elupedia.fr';

/** Dimensions de la vignette = celles des images Open Graph (`lib/og.ts`). */
const THUMBNAIL_WIDTH = 1200;
const THUMBNAIL_HEIGHT = 630;

/** Champs de la spec oEmbed 1.0 (type `rich`), en snake_case imposé par la spec. */
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

/** Sérialisation XML plate : un élément par champ défini, valeurs échappées. */
function xmlResponse(data: OEmbedResponse, status = 200): Response {
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const fields = Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `  <${key}>${escape(String(value))}</${key}>`)
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

/**
 * Reconnaît les deux familles d'URL intégrables. Toute autre URL (autre
 * origine, autre chemin, URL invalide) renvoie `null` → 404.
 */
function parseElupediaUrl(
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

/** Préflight CORS : les CMS côté navigateur interrogent l'endpoint en cross-origin. */
export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() });
};

export const GET: APIRoute = async ({ url }) => {
  const rawUrl = url.searchParams.get('url');
  const format = url.searchParams.get('format') ?? 'json';

  // 501 est le code prévu par la spec oEmbed pour un format non géré.
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

  const parsed = parseElupediaUrl(rawUrl);
  if (!parsed) {
    return new Response('URL not supported', {
      status: 404,
      headers: corsHeaders(),
    });
  }

  const db = getDb();

  if (parsed.type === 'official') {
    const { slug } = parsed;
    // Les fiches sans slug sont accessibles par leur UUID : on accepte les
    // deux formes, mais on ne compare à `officials.id` que si la valeur a la
    // forme d'un UUID (sinon Postgres rejetterait la comparaison).
    const isUuid = UUID_PATTERN.test(slug);
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

    // Une ligne par mandat : on décrit l'élu par son mandat en cours, à
    // défaut par le premier mandat renvoyé.
    const row = rows.find((r) => !r.endDate) ?? rows[0];
    if (!row)
      return new Response('Not found', { status: 404, headers: corsHeaders() });

    const fullName = `${row.firstName} ${row.lastName}`;
    const mandate = MANDATE_TYPE_LABELS[row.mandateType] ?? row.mandateType;
    const location = [row.district, row.department].filter(Boolean).join(' — ');
    // Identifiant canonique de la fiche pour les URLs produites (slug, sinon UUID).
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
        thumbnail_width: THUMBNAIL_WIDTH,
        thumbnail_height: THUMBNAIL_HEIGHT,
        // Dimensions alignées sur la carte compacte rendue par /elus/[slug]/embed.
        html: `<iframe src="${SITE}/elus/${slug2}/embed" width="500" height="140" frameborder="0" style="border:0;border-radius:12px;overflow:hidden" scrolling="no"></iframe>`,
        width: 500,
        height: 140,
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
        thumbnail_width: THUMBNAIL_WIDTH,
        thumbnail_height: THUMBNAIL_HEIGHT,
        // Pas de vue « embed » dédiée aux scrutins : on intègre la page complète.
        html: `<iframe src="${SITE}/scrutins/${ballot.id}" width="600" height="400" frameborder="0" allowfullscreen></iframe>`,
        width: 600,
        height: 400,
      },
      format,
    );
  }

  return new Response('Not found', { status: 404, headers: corsHeaders() });
};
