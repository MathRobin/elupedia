import { createDb } from '@elupedia/shared';
import { runStep, printSummary } from './run-helpers.js';
import { uploadPhotos } from './upsert/upload-photos.js';
import { logger } from './logger.js';

async function main() {
  logger.info('[Photos] Uploading official photos to S3...');
  const db = createDb();

  const results = [
    await runStep('photos', async () => {
      const r = await uploadPhotos(db);
      return {
        source: 'photos',
        created: r.uploaded,
        updated: r.skipped,
        durationMs: 0,
      };
    }),
  ];

  printSummary('Photos', results, logger);

  const hasErrors = results.some((r) => r.error);
  process.exit(hasErrors ? 1 : 0);
}

main();
