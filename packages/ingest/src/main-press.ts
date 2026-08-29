import { logger } from './logger.js';
import { runPress } from './run-press.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

runPress()
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-press.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Press ingestion failed: ${error}`);
    process.exit(1);
  });
