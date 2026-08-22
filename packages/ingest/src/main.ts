import { run } from './run.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

run()
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report.json');
    setGitHubOutput(report);

    console.log(`\nRebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    console.error('Ingestion failed:', error);
    process.exit(1);
  });
