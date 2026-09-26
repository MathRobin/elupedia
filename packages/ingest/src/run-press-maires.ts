import {
  createDb,
  officials,
  mandates,
  DEPARTMENT_NAMES,
} from '@elupedia/shared';
import { isNull, eq, and, ilike, sql } from 'drizzle-orm';

import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchPressMentions } from './sources/google-news.js';
import { upsertPressMentions } from './upsert/press-mentions.js';

export const DEFAULT_BATCH_SIZE = 1500;
const DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runPressMaires(
  batchSize: number = DEFAULT_BATCH_SIZE,
  departmentCode?: string,
): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Press ingestion (all officials) started ===\n');

  let batch;
  if (departmentCode) {
    const departmentName = DEPARTMENT_NAMES[departmentCode];
    batch = await db
      .selectDistinct({
        id: officials.id,
        firstName: officials.firstName,
        lastName: officials.lastName,
        pressCheckedAt: officials.pressCheckedAt,
      })
      .from(officials)
      .innerJoin(mandates, eq(mandates.officialId, officials.id))
      .where(
        and(
          isNull(officials.deathDate),
          ilike(mandates.department, departmentName),
          isNull(mandates.endDate),
        ),
      )
      .orderBy(sql`${officials.pressCheckedAt} asc nulls first`)
      .limit(batchSize);

    logger.info(
      `${batch.length} officials selected in ${departmentName} (${departmentCode})\n`,
    );
  } else {
    batch = await db
      .select({
        id: officials.id,
        firstName: officials.firstName,
        lastName: officials.lastName,
      })
      .from(officials)
      .where(isNull(officials.deathDate))
      .orderBy(sql`${officials.pressCheckedAt} asc nulls first`)
      .limit(batchSize);

    logger.info(
      `${batch.length} officials selected (least recently checked first, batch of ${batchSize})\n`,
    );
  }

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
        } finally {
          // Marqué comme vérifié même en cas d'erreur, pour ne pas bloquer
          // indéfiniment cet élu en tête de file au prochain run.
          await db
            .update(officials)
            .set({ pressCheckedAt: new Date() })
            .where(eq(officials.id, official.id));
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
