/**
 * Connexion Drizzle/Neon partagée par tout le site (pages SSR, endpoints
 * `pages/api/*`, sitemaps). Un seul client par instance serveur : il est créé
 * paresseusement au premier appel, jamais au chargement du module, pour que
 * les pages prérendues (`output: 'static'`) n'ouvrent pas de connexion
 * inutile au build.
 *
 * La chaîne de connexion est lue par `createDb` (packages/shared) via
 * `DATABASE_URL`.
 */
import { createDb } from '@elupedia/shared';

let _db: ReturnType<typeof createDb> | undefined;

/** Renvoie le client Drizzle du site, créé à la première demande puis réutilisé. */
export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}
