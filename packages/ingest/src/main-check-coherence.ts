/**
 * Point d'entrée CLI des contrôles de cohérence métier (lecture seule).
 *
 * Commande : `yarn --cwd packages/ingest check:coherence`
 *
 * Code de sortie 1 dès qu'une incohérence est détectée, pour pouvoir servir
 * de garde-fou dans un pipeline. Ouvre la connexion DB ici et l'injecte dans
 * check-coherence.ts, qui reste ainsi testable avec un faux `db`.
 */
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { checkCoherence, printCoherenceReport } from './check-coherence.js';

checkCoherence(createDb())
  .then((report) => {
    printCoherenceReport(report);
    process.exit(report.totalIssues > 0 ? 1 : 0);
  })
  .catch((error) => {
    logger.error(`Contrôle de cohérence failed: ${error}`);
    process.exit(1);
  });
