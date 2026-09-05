import { createDb, officials, mandates } from '@elupedia/shared';
import { eq, and, isNull, sql } from 'drizzle-orm';

import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchPressMentions } from './sources/google-news.js';
import { upsertPressMentions } from './upsert/press-mentions.js';

const BATCH_SIZE = 4000;
const DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runPressMaires(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Press ingestion (maires) started ===\n');

  const maires = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials)
    .innerJoin(mandates, eq(mandates.officialId, officials.id))
    .where(
      and(
        eq(mandates.type, 'maire'),
        isNull(mandates.endDate),
        isNull(officials.deathDate),
      ),
    )
    .orderBy(sql`random()`)
    .limit(BATCH_SIZE);

  logger.info(
    `${maires.length} mayors selected (random batch of ${BATCH_SIZE})\n`,
  );

  results.push(
    await runStep('google-news-maires', async () => {
      let totalCreated = 0;
      let totalUpdated = 0;

      for (let i = 0; i < maires.length; i++) {
        const official = maires[i];
        logger.info(
          `  [${i + 1}/${maires.length}] ${official.firstName} ${official.lastName}`,
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

        if (i < maires.length - 1) {
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

  printSummary('Press ingestion (maires)', results, logger);
  return results;
}
