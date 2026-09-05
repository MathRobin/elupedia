import { logger } from './logger.js';
import { runPressMaires } from './run-press-maires.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

runPressMaires()
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-press-maires.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Press maires ingestion failed: ${error}`);
    process.exit(1);
  });
