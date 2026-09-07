import type { APIRoute } from 'astro';

const SITE = 'https://www.elupedia.fr';

export const prerender = false;

export const GET: APIRoute = async () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE}/sitemap-static.xml</loc></sitemap>
  <sitemap><loc>${SITE}/sitemap-elus.xml</loc></sitemap>
  <sitemap><loc>${SITE}/sitemap-scrutins.xml</loc></sitemap>
</sitemapindex>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
};
