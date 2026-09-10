import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

import { runWikipedia } from './run-wikipedia.js';
import { logger } from './logger.js';

runWikipedia()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Wikipedia ingestion failed: ${error}`);
    process.exit(1);
  });
