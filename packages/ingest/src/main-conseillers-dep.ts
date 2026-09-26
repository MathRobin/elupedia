import { logger } from './logger.js';
import { parseCliArgs, CONSEILLERS_DEP_STEP_NAMES } from './cli.js';
import { runConseillersDep } from './run-conseillers-dep.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

let enabledSteps;
try {
  enabledSteps = parseCliArgs(undefined, CONSEILLERS_DEP_STEP_NAMES);
} catch (error) {
  logger.error(String(error));
  process.exit(1);
}

if (!enabledSteps) {
  process.exit(0);
}

runConseillersDep(enabledSteps)
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-conseillers-dep.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Ingestion Conseillers départementaux failed: ${error}`);
    process.exit(1);
  });
