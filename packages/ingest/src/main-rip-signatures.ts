import 'dotenv/config';
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import {
  fetchRipSignatures,
  RIP_PROPOSITIONS,
} from './sources/rip-signatures.js';
import { upsertRipSignatures } from './upsert/sponsorships.js';

async function main() {
  const db = createDb();

  for (const proposition of RIP_PROPOSITIONS) {
    logger.info(`=== RIP ${proposition.year} — ${proposition.subject} ===`);
    const rows = await fetchRipSignatures(proposition);
    await upsertRipSignatures(db, rows, proposition.year, proposition.subject);
  }

  logger.info('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`RIP signatures ingestion failed: ${error}`);
    process.exit(1);
  });
