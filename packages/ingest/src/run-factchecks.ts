import { createDb, officials, mandates } from '@elupedia/shared';
import { isNull, eq, or } from 'drizzle-orm';

import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { searchFactChecks } from './sources/google-factcheck.js';
import { upsertFactChecks } from './upsert/fact-checks.js';

export async function runFactChecks(): Promise<StepResult[]> {
  const apiKey = process.env.GOOGLE_FACTCHECK_API_KEY;
  if (!apiKey) {
    logger.error('GOOGLE_FACTCHECK_API_KEY is not set');
    return [];
  }

  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Fact-check ingestion started ===\n');

  results.push(
    await runStep('factchecks', async () => {
      const rows = await db
        .select({
          id: officials.id,
          firstName: officials.firstName,
          lastName: officials.lastName,
        })
        .from(officials)
        .innerJoin(mandates, eq(mandates.officialId, officials.id))
        .where(
          or(
            eq(mandates.type, 'depute'),
            eq(mandates.type, 'senateur'),
            isNull(mandates.endDate),
          ),
        )
        .groupBy(officials.id, officials.firstName, officials.lastName);

      logger.info(`  ${rows.length} officials to query`);

      let totalCreated = 0;
      let totalUpdated = 0;
      let errors = 0;
      let queried = 0;

      for (const row of rows) {
        try {
          const query = `${row.firstName} ${row.lastName}`;
          const items = await searchFactChecks(query, apiKey);

          if (items.length > 0) {
            const r = await upsertFactChecks(db, row.id, items);
            totalCreated += r.created;
            totalUpdated += r.updated;
            if (r.created > 0) {
              logger.info(
                `  ${row.firstName} ${row.lastName}: ${r.created} new, ${r.updated} updated`,
              );
            }
          }

          queried++;
          if (queried % 100 === 0) {
            logger.info(
              `  Progress: ${queried}/${rows.length} (${totalCreated} new)`,
            );
          }
        } catch (e) {
          errors++;
          logger.warn(`  Error for ${row.firstName} ${row.lastName}: ${e}`);
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (errors > 0) logger.warn(`  ${errors} errors`);
      return {
        source: 'factchecks',
        created: totalCreated,
        updated: totalUpdated,
        durationMs: 0,
      };
    }),
  );

  printSummary('Fact-check ingestion', results, logger);
  return results;
}
