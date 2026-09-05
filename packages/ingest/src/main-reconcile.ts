import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { reconcileElections } from './reconcile-elections.js';

reconcileElections(createDb())
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Reconciliation failed: ${error}`);
    process.exit(1);
  });
