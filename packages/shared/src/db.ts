/**
 * Fabrique du client Drizzle partagé par l'ingest, le site et l'admin.
 *
 * Utilise le driver HTTP de Neon (une requête = un appel HTTP, pas de
 * connexion persistante) : adapté aux fonctions serverless et aux scripts
 * batch, mais sans transactions interactives (`db.transaction` n'est pas
 * disponible avec `neon-http`).
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

/**
 * Crée un client Drizzle connecté à Neon.
 *
 * @param databaseUrl URL Postgres explicite ; à défaut, `DATABASE_URL` de
 *   l'environnement. Lève une erreur si aucune des deux n'est définie
 *   (message testé par `tests/drizzle-setup.test.js`).
 */
export function createDb(databaseUrl?: string) {
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  const sql = neon(url);
  return drizzle({ client: sql });
}
