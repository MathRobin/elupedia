import { logger } from './logger.js';
import { parseCliArgs, SENAT_STEP_NAMES } from './cli.js';
import { runSenat } from './run-senat.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

let enabledSteps;
try {
  enabledSteps = parseCliArgs(undefined, SENAT_STEP_NAMES);
} catch (error) {
  logger.error(String(error));
  process.exit(1);
}

if (!enabledSteps) {
  process.exit(0);
}

runSenat(enabledSteps)
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-senat.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Ingestion Sénat failed: ${error}`);
    process.exit(1);
  });
