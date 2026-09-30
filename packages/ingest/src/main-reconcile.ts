import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { reconcileElections } from './reconcile-elections.js';

reconcileElections(createDb())
  .then(() => process.exit(0))
  .catch((error) => {
    // `${error}` seul n'affiche que le message de premier niveau — pour les
    // erreurs du driver Neon/Postgres, la vraie cause (timeout réseau, etc.)
    // est souvent dans `error.cause`, jamais imprimée sinon.
    logger.error(`Reconciliation failed: ${error?.stack ?? error}`);
    if (error?.cause) {
      logger.error(`Cause: ${error.cause?.stack ?? error.cause}`);
    }
    process.exit(1);
  });
