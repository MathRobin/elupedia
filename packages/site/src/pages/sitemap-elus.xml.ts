import type { APIRoute } from 'astro';
import { getDb } from '../lib/db.js';
import { officials } from '@elupedia/shared';
import { isNotNull } from 'drizzle-orm';

const SITE = 'https://www.elupedia.fr';

export const prerender = false;

export const GET: APIRoute = async () => {
  const db = getDb();

  const rows = await db
    .select({ slug: officials.slug })
    .from(officials)
    .where(isNotNull(officials.slug));

  const urls = rows
    .map(
      (r) =>
        `  <url>
    <loc>${SITE}/elus/${r.slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
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
