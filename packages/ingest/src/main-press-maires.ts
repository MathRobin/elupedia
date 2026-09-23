import { parseArgs } from 'node:util';
import { logger } from './logger.js';
import { runPressMaires, DEFAULT_BATCH_SIZE } from './run-press-maires.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    limit: { type: 'string' },
  },
  strict: true,
});

let batchSize = DEFAULT_BATCH_SIZE;
if (values.limit !== undefined) {
  const parsed = parseInt(values.limit, 10);
  if (isNaN(parsed) || parsed <= 0) {
    logger.error(
      `--limit invalide : "${values.limit}" (entier positif attendu)`,
    );
    process.exit(1);
  }
  batchSize = parsed;
}

runPressMaires(batchSize)
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
