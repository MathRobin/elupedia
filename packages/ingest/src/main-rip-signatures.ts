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
    try {
      const rows = await fetchRipSignatures(proposition);
      await upsertRipSignatures(
        db,
        rows,
        proposition.year,
        proposition.subject,
        proposition.decisionDate,
      );
    } catch (error) {
      logger.error(
        `RIP ${proposition.year} — ${proposition.subject} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  logger.info('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`RIP signatures ingestion failed: ${error}`);
    process.exit(1);
  });
