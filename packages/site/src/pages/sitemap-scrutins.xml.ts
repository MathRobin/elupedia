/**
 * `GET /sitemap-scrutins.xml` : une entrée par scrutin (`ballots`), sans
 * filtre. Cache CDN 24 h. Référencé par `sitemap-index.xml.ts`.
 */
import type { APIRoute } from 'astro';
import { getDb } from '../lib/db.js';
import { ballots } from '@elupedia/shared';

const SITE = 'https://www.elupedia.fr';

export const prerender = false;

export const GET: APIRoute = async () => {
  const db = getDb();

  const rows = await db.select({ id: ballots.id }).from(ballots);

  const urls = rows
    .map(
      (ballot) =>
        `  <url>
    <loc>${SITE}/scrutins/${ballot.id}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`,
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
};
