/**
 * Point d'entrée CLI de l'ingestion des candidatures aux sénatoriales 2026
 * (pré-scrutin, voir docs/DOMAINS.md).
 *
 * Commande : `yarn --cwd packages/ingest ingest:senat:candidacies` (aucune option)
 *
 * Convention du package : un `main-*.ts` est un point d'entrée CLI, et rien
 * d'autre — il parse les arguments, lance l'orchestrateur `run-*.ts` du même
 * nom, écrit le rapport de changements et fixe le code de sortie. Toute la
 * logique (lecture des sources, upserts) vit dans le `run-*.ts`, testable
 * sans processus ni process.exit().
 *
 * Pas de rapport de changements ici (contrairement aux autres mains) : ce
 * script n'est pas suivi d'un rebuild conditionnel. Logique dans `run-senat-candidacies.ts`.
 */
import { logger } from './logger.js';
import { runSenatCandidacies } from './run-senat-candidacies.js';

runSenatCandidacies().catch((error) => {
  logger.error(
    `Fatal error: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
});
