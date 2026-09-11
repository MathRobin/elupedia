import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  return Response.redirect('https://www.elupedia.fr/docs/commune-api', 302);
};
