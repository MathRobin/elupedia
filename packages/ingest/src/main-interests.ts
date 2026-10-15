/**
 * Point d'entrée CLI de l'ingestion des déclarations d'intérêts HATVP
 * (transverse : députés, sénateurs, eurodéputés, exécutifs locaux).
 *
 * Commande : `yarn --cwd packages/ingest ingest:interests` (aucune option)
 *
 * Convention du package : un `main-*.ts` est un point d'entrée CLI, et rien
 * d'autre — il parse les arguments, lance l'orchestrateur `run-*.ts` du même
 * nom, écrit le rapport de changements et fixe le code de sortie. Toute la
 * logique (lecture des sources, upserts) vit dans le `run-*.ts`, testable
 * sans processus ni process.exit().
 *
 * Le rapport JSON écrit à la racine du package et la sortie GITHUB_OUTPUT
 * (voir utils/change-detector.ts) servent à l'orchestrateur à décider s'il
 * faut reconstruire le site. Logique dans `run-interests.ts`.
 */
import { logger } from './logger.js';
import { runInterests } from './run-interests.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

runInterests()
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-interests.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Ingestion HATVP interests failed: ${error}`);
    process.exit(1);
  });
