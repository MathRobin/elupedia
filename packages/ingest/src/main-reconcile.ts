/**
 * Point d'entrée CLI de la réconciliation candidats–élus : rattache aux
 * fiches `officials` les candidats (municipales, législatives, sénatoriales)
 * dont `official_id` est encore vide (voir reconcile-elections.ts).
 *
 * Commande : `yarn --cwd packages/ingest reconcile`
 *
 * Ouvre la connexion DB ici et l'injecte, pour garder reconcile-elections.ts
 * testable avec un faux `db`.
 */
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { reconcileElections } from './reconcile-elections.js';

reconcileElections(createDb())
  .then(() => process.exit(0))
  .catch((error) => {
    // `${error}` seul n'affiche que le message de premier niveau — pour les
    // erreurs du driver Neon/Postgres, la vraie cause (timeout réseau, etc.)
    // est souvent dans `error.cause`, jamais imprimée sinon.
    logger.error(`Reconciliation failed: ${error?.stack ?? error}`);
    if (error?.cause) {
      logger.error(`Cause: ${error.cause?.stack ?? error.cause}`);
    }
    process.exit(1);
  });
