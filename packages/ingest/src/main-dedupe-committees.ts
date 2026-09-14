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
