/**
 * Point d'entrée CLI de la fusion des fiches `officials` en doublon
 * AN / Sénat (voir merge-duplicate-officials.ts).
 *
 * Commande : `yarn --cwd packages/ingest merge:duplicate-officials [--apply]`
 *
 * Sans `--apply`, dry-run : affiche le plan paire par paire, n'écrit rien.
 * Avec `--apply`, écrit en base (réaffectations, suppressions de lignes
 * redondantes, suppression des fiches AN). Ouvre la connexion DB ici et
 * l'injecte, pour garder merge-duplicate-officials.ts testable.
 */
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { mergeDuplicateOfficials } from './merge-duplicate-officials.js';

const dryRun = !process.argv.includes('--apply');

mergeDuplicateOfficials(createDb(), { dryRun })
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Fusion des fiches en doublon failed: ${error}`);
    if (error?.cause)
      logger.error(`Cause: ${error.cause?.message ?? error.cause}`);
    process.exit(1);
  });
