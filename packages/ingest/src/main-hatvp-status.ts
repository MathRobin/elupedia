import { logger } from './logger.js';
import { runHatvpStatus } from './run-hatvp-status.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

runHatvpStatus()
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-hatvp-status.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`HATVP status check failed: ${error}`);
    process.exit(1);
  });
