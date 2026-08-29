import { logger } from './logger.js';
import { runAnPartial } from './run-an-partial.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

runAnPartial()
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-an-partial.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Ingestion AN partielle failed: ${error}`);
    process.exit(1);
  });
