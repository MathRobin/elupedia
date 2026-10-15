/**
 * Point d'entrée « bibliothèque » du package, quasi vide : @elupedia/ingest
 * s'utilise par ses scripts (`yarn --cwd packages/ingest ingest:*`), pas par
 * import. Seul le nom est exposé, pour les tests de structure du monorepo.
 */
export const name = '@elupedia/ingest';
