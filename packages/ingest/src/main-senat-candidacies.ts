import { logger } from './logger.js';
import { runSenatCandidacies } from './run-senat-candidacies.js';

runSenatCandidacies().catch((error) => {
  logger.error(
    `Fatal error: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
});
