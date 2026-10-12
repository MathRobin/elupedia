/**
 * Réexport des référentiels de départements du package partagé, pour que les
 * composants du site (`OfficialsList`, `pages/scrutins/[id].astro`) importent
 * un chemin local plutôt que `@elupedia/shared` directement.
 */
export { DEPARTMENT_CODES, DEPARTMENT_NAMES } from '@elupedia/shared';
