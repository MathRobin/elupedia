import { logger } from './logger.js';
import { parseCliArgs, AN_STEP_NAMES } from './cli.js';
import { runAn } from './run-an.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

let enabledSteps;
try {
  enabledSteps = parseCliArgs(undefined, AN_STEP_NAMES);
} catch (error) {
  logger.error(String(error));
  process.exit(1);
}

if (!enabledSteps) {
  process.exit(0);
}

runAn(enabledSteps)
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-an.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Ingestion AN failed: ${error}`);
    process.exit(1);
  });
