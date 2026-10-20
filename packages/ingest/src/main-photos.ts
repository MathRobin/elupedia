/**
 * Point d'entrée CLI de l'envoi des photos officielles vers S3
 * (upsert/upload-photos.ts). Même étape que `photos` dans `run.ts`, isolée
 * ici pour pouvoir être planifiée seule.
 *
 * Commande : `yarn --cwd packages/ingest ingest:photos`
 *
 * Exception à la convention main/run du package : pas de `run-photos.ts`, le
 * main appelle directement l'upsert via runStep. Écrit
 * ingest-report-photos.json. Code de sortie 1 si l'étape a échoué.
 */
import { createDb } from '@elupedia/shared';
import { runStep, printSummary } from './run-helpers.js';
import { detectChanges, writeChangeReport } from './utils/change-detector.js';
import { uploadPhotos } from './upsert/upload-photos.js';
import { logger } from './logger.js';

async function main() {
  logger.info('[Photos] Uploading official photos to S3...');
  const db = createDb();

  const results = [
    await runStep('photos', async () => {
      const upload = await uploadPhotos(db);
      // Pas de colonne « ignorées » dans StepResult : on recycle `updated`.
      return {
        source: 'photos',
        created: upload.uploaded,
        updated: upload.skipped,
        durationMs: 0,
      };
    }),
  ];

  printSummary('Photos', results, logger);
  // Date et résultat du dernier run, lus par l'admin (page Ingestions).
  writeChangeReport(detectChanges(results), 'ingest-report-photos.json');

  const hasErrors = results.some((result) => result.error);
  process.exit(hasErrors ? 1 : 0);
}

main();
