import { logger } from './logger.js';
import { runSenatResultats } from './run-senat-resultats.js';

runSenatResultats().catch((error) => {
  logger.error(
    `Fatal error: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
});
