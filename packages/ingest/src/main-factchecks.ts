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
 * Pas de rapport de changements ici (contrairement aux autres mains) : ce
 * script n'est pas suivi d'un rebuild conditionnel. Logique dans `run-factchecks.ts`.
 */
import { runFactChecks } from './run-factchecks.js';
import { logger } from './logger.js';

runFactChecks()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Fact-check ingestion failed: ${error}`);
    process.exit(1);
  });
