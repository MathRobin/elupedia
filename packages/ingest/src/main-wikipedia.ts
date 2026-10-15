/**
 * Point d'entrée CLI de la recherche de pages Wikipédia (fr) pour les élus
 * qui n'ont pas encore de lien externe `wikipedia_fr`.
 *
 * Commande : `yarn --cwd packages/ingest ingest:wikipedia` (aucune option)
 *
 * Convention du package : un `main-*.ts` est un point d'entrée CLI, et rien
 * d'autre — il parse les arguments, lance l'orchestrateur `run-*.ts` du même
 * nom, écrit le rapport de changements et fixe le code de sortie. Toute la
 * logique (lecture des sources, upserts) vit dans le `run-*.ts`, testable
 * sans processus ni process.exit().
 *
 * Pas de rapport de changements ici (contrairement aux autres mains) : ce
 * script n'est pas suivi d'un rebuild conditionnel. Logique dans `run-wikipedia.ts`.
 */
import { runWikipedia } from './run-wikipedia.js';
import { logger } from './logger.js';

runWikipedia()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Wikipedia ingestion failed: ${error}`);
    process.exit(1);
  });
