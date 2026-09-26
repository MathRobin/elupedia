import { logger } from './logger.js';
import { parseCliArgs, MEMBRES_ASSEMBLEE_STEP_NAMES } from './cli.js';
import { runMembresAssemblee } from './run-membres-assemblee.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

let enabledSteps;
try {
  enabledSteps = parseCliArgs(undefined, MEMBRES_ASSEMBLEE_STEP_NAMES);
} catch (error) {
  logger.error(String(error));
  process.exit(1);
}

if (!enabledSteps) {
  process.exit(0);
}

runMembresAssemblee(enabledSteps)
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-membres-assemblee.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(
      `Ingestion Membres assemblée statut particulier failed: ${error}`,
    );
    process.exit(1);
  });
