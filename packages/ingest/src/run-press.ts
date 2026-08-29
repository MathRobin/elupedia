import { createDb, officials } from '@elupedia/shared';
import { isNull } from 'drizzle-orm';

import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchPressMentions } from './sources/google-news.js';
import { upsertPressMentions } from './upsert/press-mentions.js';

const DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runPress(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Press ingestion started ===\n');

  const livingOfficials = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials)
    .where(isNull(officials.deathDate));

  logger.info(`${livingOfficials.length} living officials to process\n`);

  results.push(
    await runStep('google-news', async () => {
      let totalCreated = 0;
      let totalUpdated = 0;

      for (let i = 0; i < livingOfficials.length; i++) {
        const official = livingOfficials[i];
        logger.info(
          `  [${i + 1}/${livingOfficials.length}] ${official.lastName}`,
        );

        try {
          const mentions = await fetchPressMentions(
            official.id,
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

        if (i < livingOfficials.length - 1) {
          await sleep(DELAY_MS);
        }
      }

      return {
        source: 'google-news',
        created: totalCreated,
        updated: totalUpdated,
        durationMs: 0,
      };
    }),
  );

  printSummary('Press ingestion', results, logger);
  return results;
}
