import { logger } from './logger.js';
import { runInterests } from './run-interests.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

runInterests()
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-interests.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Ingestion HATVP interests failed: ${error}`);
    process.exit(1);
  });
