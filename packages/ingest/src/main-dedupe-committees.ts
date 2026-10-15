/**
 * Point d'entrée CLI du dédoublonnage des commissions (« nom » vs
 * « nom (abrégé) », voir dedupe-committees.ts).
 *
 * Commande : `yarn --cwd packages/ingest dedupe:committees [--dry-run]`
 *
 * Sans --dry-run, le script écrit en base (renommages + suppressions). Ouvre
 * la connexion DB ici et l'injecte, pour garder dedupe-committees.ts testable.
 */
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { dedupeCommittees } from './dedupe-committees.js';

const dryRun = process.argv.includes('--dry-run');

dedupeCommittees(createDb(), { dryRun })
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Dédoublonnage des commissions failed: ${error}`);
    process.exit(1);
  });
