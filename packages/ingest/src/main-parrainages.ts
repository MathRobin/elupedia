import 'dotenv/config';
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import {
  fetchParrainages,
  PARRAINAGES_ELECTIONS,
} from './sources/parrainages.js';
import { upsertSponsorships } from './upsert/sponsorships.js';

const yearArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;

async function main() {
  const db = createDb();
  const elections = yearArg
    ? PARRAINAGES_ELECTIONS.filter((e) => e.year === yearArg)
    : PARRAINAGES_ELECTIONS;

  if (elections.length === 0) {
    logger.error(
      `No election found for year ${yearArg}. Available: ${PARRAINAGES_ELECTIONS.map((e) => e.year).join(', ')}`,
    );
    process.exit(1);
  }

  for (const election of elections) {
    logger.info(`=== Parrainages ${election.year} ===`);
    const rows = await fetchParrainages(election);
    await upsertSponsorships(db, rows, election.year);
  }

  logger.info('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Parrainages ingestion failed: ${error}`);
    process.exit(1);
  });
