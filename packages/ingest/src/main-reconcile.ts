import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { reconcileElections } from './reconcile-elections.js';

reconcileElections(createDb())
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Reconciliation failed: ${error}`);
    process.exit(1);
  });
