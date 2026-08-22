import { run } from './run.js';

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Ingestion failed:', error);
    process.exit(1);
  });
