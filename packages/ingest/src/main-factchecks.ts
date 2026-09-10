import { runFactChecks } from './run-factchecks.js';
import { logger } from './logger.js';

runFactChecks()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Fact-check ingestion failed: ${error}`);
    process.exit(1);
  });
