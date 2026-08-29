import { logger } from './logger.js';
import { runSocialLinks } from './run-social-links.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

runSocialLinks()
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-social-links.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Social links ingestion failed: ${error}`);
    process.exit(1);
  });
