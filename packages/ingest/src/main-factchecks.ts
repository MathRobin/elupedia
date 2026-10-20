/**
 * Point d'entrée CLI de l'ingestion des fact-checks (Google Fact Check Tools
 * API) sur les parlementaires et élus en mandat. Nécessite
 * GOOGLE_FACTCHECK_API_KEY dans l'environnement.
 *
 * Commande : `yarn --cwd packages/ingest ingest:factchecks` (aucune option)
 *
 * Convention du package : un `main-*.ts` est un point d'entrée CLI, et rien
 * d'autre — il parse les arguments, lance l'orchestrateur `run-*.ts` du même
 * nom, écrit le rapport de changements et fixe le code de sortie. Toute la
 * logique (lecture des sources, upserts) vit dans le `run-*.ts`, testable
 * sans processus ni process.exit().
 *
 * Écrit ingest-report-factchecks.json (date et résultat du dernier run, lus par
 * l'admin) ; pas de rebuild conditionnel derrière. Logique dans `run-factchecks.ts`.
 */
import { runFactChecks } from './run-factchecks.js';
import { detectChanges, writeChangeReport } from './utils/change-detector.js';
import { logger } from './logger.js';

runFactChecks()
  .then((results) => {
    writeChangeReport(detectChanges(results), 'ingest-report-factchecks.json');
    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Fact-check ingestion failed: ${error}`);
    process.exit(1);
  });
