/**
 * `GET /api/commune` sans code INSEE : redirige (302) vers la documentation
 * de l'API Commune. Le vrai endpoint est `./[code].ts`.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  return Response.redirect('https://www.elupedia.fr/docs/commune-api', 302);
};
