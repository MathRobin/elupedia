/**
 * Point d'entrée CLI de l'ingestion des liens vers les réseaux sociaux
 * (pages AN, fiches individuelles des députés, scraping des sites personnels).
 *
 * Commande : `yarn --cwd packages/ingest ingest:social-links` (aucune option)
 *
 * Convention du package : un `main-*.ts` est un point d'entrée CLI, et rien
 * d'autre — il parse les arguments, lance l'orchestrateur `run-*.ts` du même
 * nom, écrit le rapport de changements et fixe le code de sortie. Toute la
 * logique (lecture des sources, upserts) vit dans le `run-*.ts`, testable
 * sans processus ni process.exit().
 *
 * Le rapport JSON écrit à la racine du package et la sortie GITHUB_OUTPUT
 * (voir utils/change-detector.ts) servent à l'orchestrateur à décider s'il
 * faut reconstruire le site. Logique dans `run-social-links.ts`.
 */
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
