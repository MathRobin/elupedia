import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { checkCoherence, printCoherenceReport } from './check-coherence.js';

checkCoherence(createDb())
  .then((report) => {
    printCoherenceReport(report);
    process.exit(report.totalIssues > 0 ? 1 : 0);
  })
  .catch((error) => {
    logger.error(`Contrôle de cohérence failed: ${error}`);
    process.exit(1);
  });
