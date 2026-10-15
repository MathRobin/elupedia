/**
 * Point d'entrée public de `@elupedia/shared`.
 *
 * Tout ce que l'ingest, le site et l'admin importent depuis
 * `@elupedia/shared` passe par ici : le client DB, les tables Drizzle
 * (via `schema/index.ts`) et les référentiels/helpers purs (codes
 * départements, couleurs et URLs des groupes politiques, slugs, libellés
 * de mandats). Le package est consommé directement en TypeScript source
 * (`main: src/index.ts`), sans étape de build.
 */
export { createDb } from './db.js';
export * from './schema/index.js';
export { DEPARTMENT_CODES, DEPARTMENT_NAMES } from './department-codes.js';
export { POLITICAL_GROUP_COLORS } from './political-group-colors.js';
export { POLITICAL_GROUP_URLS } from './political-group-urls.js';
export { buildHatvpSlug, buildHatvpUrl } from './hatvp-url.js';
export { slugifyText } from './slugify.js';
export { MANDATE_TYPE_LABELS, mandateTypeLabel } from './mandate-labels.js';
export { generateHemicycleSeats } from './hemicycle-layout.js';
export {
  POLITICAL_GROUP_ORDER,
  politicalGroupRank,
} from './political-group-order.js';
export { politicalBloc, type PoliticalBloc } from './political-group-order.js';
