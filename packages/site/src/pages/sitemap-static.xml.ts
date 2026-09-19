import type { APIRoute } from 'astro';
import { glossaryEntries } from '../lib/glossary.js';

const SITE = 'https://www.elupedia.fr';

const STATIC_PAGES = [
  { loc: '/', priority: '1.0', changefreq: 'daily' },
  { loc: '/elus', priority: '0.9', changefreq: 'daily' },
  { loc: '/votes', priority: '0.8', changefreq: 'daily' },
  { loc: '/glossaire', priority: '0.7', changefreq: 'monthly' },
  { loc: '/a-propos', priority: '0.5', changefreq: 'monthly' },
  { loc: '/changelog', priority: '0.3', changefreq: 'weekly' },
  { loc: '/mentions-legales', priority: '0.2', changefreq: 'yearly' },
  { loc: '/donnees-personnelles', priority: '0.2', changefreq: 'yearly' },
  { loc: '/accessibilite', priority: '0.2', changefreq: 'yearly' },
  ...glossaryEntries.map((e) => ({
    loc: `/glossaire/${e.slug}`,
    priority: '0.6',
    changefreq: 'monthly' as const,
  })),
];

export const prerender = false;

export const GET: APIRoute = async () => {
  const urls = STATIC_PAGES.map(
    (p) =>
      `  <url>
    <loc>${SITE}${p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
  ).join('\n');

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
