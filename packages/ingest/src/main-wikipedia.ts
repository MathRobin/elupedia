import { runWikipedia } from './run-wikipedia.js';
import { logger } from './logger.js';

runWikipedia()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Wikipedia ingestion failed: ${error}`);
    process.exit(1);
  });
