/**
 * Point d'entrée CLI de l'ingestion des parrainages (présentations) aux
 * élections présidentielles, publiés par le Conseil constitutionnel.
 *
 * Commande : `yarn --cwd packages/ingest ingest:parrainages [année]`
 *   (sans argument : toutes les élections de PARRAINAGES_ELECTIONS)
 *
 * Exception à la convention main/run du package : la logique est ici, sans
 * `run-parrainages.ts`. Une élection en erreur est loguée et n'empêche pas
 * les suivantes ; le code de sortie reste 0 dans ce cas.
 */
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import {
  fetchParrainages,
  PARRAINAGES_ELECTIONS,
} from './sources/parrainages.js';
import { upsertSponsorships } from './upsert/sponsorships.js';

// Année optionnelle en premier argument positionnel (ex. `ingest:parrainages 2022`).
const yearArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;

async function main() {
  const db = createDb();
  const elections = yearArg
    ? PARRAINAGES_ELECTIONS.filter((election) => election.year === yearArg)
    : PARRAINAGES_ELECTIONS;

  if (elections.length === 0) {
    logger.error(
      `No election found for year ${yearArg}. Available: ${PARRAINAGES_ELECTIONS.map((election) => election.year).join(', ')}`,
    );
    process.exit(1);
  }

  for (const election of elections) {
    logger.info(`=== Parrainages ${election.year} ===`);
    try {
      const rows = await fetchParrainages(election);
      await upsertSponsorships(db, rows, election.year);
    } catch (error) {
      logger.error(
        `Parrainages ${election.year} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  logger.info('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Parrainages ingestion failed: ${error}`);
    process.exit(1);
  });
