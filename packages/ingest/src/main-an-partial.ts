/**
 * Point d'entrée CLI de l'ingestion AN « partielle » : uniquement l'activité
 * parlementaire des députés encore en mandat, sans réponses anciennes (voir
 * filters/partial.ts). Plus rapide que `ingest:an`, prévu pour tourner souvent.
 *
 * Commande : `yarn --cwd packages/ingest ingest:an:partial` (aucune option)
 *
 * Convention du package : un `main-*.ts` est un point d'entrée CLI, et rien
 * d'autre — il parse les arguments, lance l'orchestrateur `run-*.ts` du même
 * nom, écrit le rapport de changements et fixe le code de sortie. Toute la
 * logique (lecture des sources, upserts) vit dans le `run-*.ts`, testable
 * sans processus ni process.exit().
 *
 * Le rapport JSON écrit à la racine du package et la sortie GITHUB_OUTPUT
 * (voir utils/change-detector.ts) servent à l'orchestrateur à décider s'il
 * faut reconstruire le site. Logique dans `run-an-partial.ts`.
 */
import { logger } from './logger.js';
import { runAnPartial } from './run-an-partial.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

runAnPartial()
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-an-partial.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Ingestion AN partielle failed: ${error}`);
    process.exit(1);
  });
