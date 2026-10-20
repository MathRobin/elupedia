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
 * Écrit ingest-report-wikipedia.json (date et résultat du dernier run, lus par
 * l'admin) ; pas de rebuild conditionnel derrière. Logique dans `run-wikipedia.ts`.
 */
import { runWikipedia } from './run-wikipedia.js';
import { detectChanges, writeChangeReport } from './utils/change-detector.js';
import { logger } from './logger.js';

runWikipedia()
  .then((results) => {
    writeChangeReport(detectChanges(results), 'ingest-report-wikipedia.json');
    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Wikipedia ingestion failed: ${error}`);
    process.exit(1);
  });
