import { logger } from './logger.js';
import { parseCliArgs, CONSEILLERS_FDE_STEP_NAMES } from './cli.js';
import { runConseillersFde } from './run-conseillers-fde.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

let enabledSteps;
try {
  enabledSteps = parseCliArgs(undefined, CONSEILLERS_FDE_STEP_NAMES);
} catch (error) {
  logger.error(String(error));
  process.exit(1);
}

if (!enabledSteps) {
  process.exit(0);
}

runConseillersFde(enabledSteps)
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-conseillers-fde.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(
      `Ingestion Conseillers des Français de l'étranger failed: ${error}`,
    );
    process.exit(1);
  });
