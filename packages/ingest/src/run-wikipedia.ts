import { createDb, officials, externalLinks, mandates } from '@elupedia/shared';
import { eq, and, or, isNull } from 'drizzle-orm';

import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { withRetry } from './utils/retry.js';
import { findWikipediaUrl } from './sources/wikipedia.js';

export async function runWikipedia(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Wikipedia ingestion started ===\n');

  results.push(
    await runStep('wikipedia', async () => {
      const existingWiki = await db
        .select({ officialId: externalLinks.officialId })
        .from(externalLinks)
        .where(eq(externalLinks.platform, 'wikipedia_fr'));
      const alreadyHasWiki = new Set(existingWiki.map((r) => r.officialId));

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
            eq(mandates.type, 'maire'),
            isNull(mandates.endDate),
          ),
        )
        .groupBy(officials.id, officials.firstName, officials.lastName);

      const candidates = rows.filter((r) => !alreadyHasWiki.has(r.id));
      logger.info(
        `  ${rows.length} officials total, ${candidates.length} without Wikipedia link`,
      );

      let created = 0;
      let errors = 0;
      let queried = 0;

      for (const row of candidates) {
        try {
          const url = await withRetry(
            () => findWikipediaUrl(row.firstName, row.lastName),
            { source: 'wikipedia', maxAttempts: 2, baseDelayMs: 2000 },
          );

          if (url) {
            const existing = await db
              .select({ id: externalLinks.id })
              .from(externalLinks)
              .where(
                and(
                  eq(externalLinks.officialId, row.id),
                  eq(externalLinks.platform, 'wikipedia_fr'),
                ),
              )
              .limit(1);

            if (existing.length === 0) {
              await db.insert(externalLinks).values({
                officialId: row.id,
                platform: 'wikipedia_fr',
                url,
                status: 'published',
                source: 'wikipedia_api',
                capturedAt: new Date().toISOString().slice(0, 10),
              });
              created++;
              logger.info(`  + ${row.firstName} ${row.lastName}: ${url}`);
            }
          }

          queried++;
          if (queried % 100 === 0) {
            logger.info(
              `  Progress: ${queried}/${candidates.length} (${created} found)`,
            );
          }
        } catch (e) {
          errors++;
          logger.warn(`  Error for ${row.firstName} ${row.lastName}: ${e}`);
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (errors > 0) logger.warn(`  ${errors} errors`);
      return {
        source: 'wikipedia',
        created,
        updated: 0,
        durationMs: 0,
      };
    }),
  );

  printSummary('Wikipedia ingestion', results, logger);
  return results;
}
