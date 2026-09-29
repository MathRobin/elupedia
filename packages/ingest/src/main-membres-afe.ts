import { logger } from './logger.js';
import { parseCliArgs, MEMBRES_AFE_STEP_NAMES } from './cli.js';
import { runMembresAfe } from './run-membres-afe.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

let enabledSteps;
try {
  enabledSteps = parseCliArgs(undefined, MEMBRES_AFE_STEP_NAMES);
} catch (error) {
  logger.error(String(error));
  process.exit(1);
}

if (!enabledSteps) {
  process.exit(0);
}

runMembresAfe(enabledSteps)
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-membres-afe.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(
      `Ingestion Membres de l'Assemblée des Français de l'étranger failed: ${error}`,
    );
    process.exit(1);
  });
