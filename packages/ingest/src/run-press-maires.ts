import { createDb, officials } from '@elupedia/shared';
import { isNull, sql } from 'drizzle-orm';

import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchPressMentions } from './sources/google-news.js';
import { upsertPressMentions } from './upsert/press-mentions.js';

const BATCH_SIZE = 1500;
const DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runPressMaires(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Press ingestion (all officials) started ===\n');

  const batch = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials)
    .where(isNull(officials.deathDate))
    .orderBy(sql`random()`)
    .limit(BATCH_SIZE);

  logger.info(
    `${batch.length} officials selected (random batch of ${BATCH_SIZE})\n`,
  );

  results.push(
    await runStep('google-news-maires', async () => {
      let totalCreated = 0;
      let totalUpdated = 0;

      for (let i = 0; i < batch.length; i++) {
        const official = batch[i];
        logger.info(
          `  [${i + 1}/${batch.length}] ${official.firstName} ${official.lastName}`,
        );

        try {
          const mentions = await fetchPressMentions(
            official.id,
            official.firstName,
            official.lastName,
          );
          const r = await upsertPressMentions(db, mentions);
          totalCreated += r.created;
          totalUpdated += r.updated;
          logger.info(`    → ${mentions.length} articles, ${r.created} new`);
        } catch (err) {
          logger.warn(
            `    → error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        if (i < batch.length - 1) {
          await sleep(DELAY_MS);
        }
      }

      return {
        source: 'google-news-maires',
        created: totalCreated,
        updated: totalUpdated,
        durationMs: 0,
      };
    }),
  );

  printSummary('Press ingestion (all officials)', results, logger);
  return results;
}
