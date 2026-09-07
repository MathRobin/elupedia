import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { communeTransparency } from '@elupedia/shared';
import { type MadadaBody } from '../sources/madada.js';
import { logger } from '../logger.js';

const BATCH_SIZE = 100;

export async function upsertCommuneTransparency(
  db: NeonHttpDatabase,
  data: Map<string, MadadaBody>,
): Promise<{ created: number }> {
  const seenUrlNames = new Set<string>();
  const entries: {
    communeCode: string;
    madadaUrlName: string;
    requestsCount: number;
    requestsSuccessful: number;
    requestsOverdue: number;
    requestsNotHeld: number;
  }[] = [];

  for (const [communeCode, body] of data) {
    if (seenUrlNames.has(body.url_name)) continue;
    seenUrlNames.add(body.url_name);
    entries.push({
      communeCode,
      madadaUrlName: body.url_name,
      requestsCount: body.info.requests_count,
      requestsSuccessful: body.info.requests_successful_count,
      requestsOverdue: body.info.requests_overdue_count,
      requestsNotHeld: body.info.requests_not_held_count,
    });
  }

  const skipped = data.size - entries.length;
  if (skipped > 0) {
    logger.info(`Commune transparency: ${skipped} duplicate url_names skipped`);
  }

  let total = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await db
      .insert(communeTransparency)
      .values(batch)
      .onConflictDoUpdate({
        target: communeTransparency.communeCode,
        set: {
          madadaUrlName: sql`excluded."madada_url_name"`,
          requestsCount: sql`excluded."requests_count"`,
          requestsSuccessful: sql`excluded."requests_successful"`,
          requestsOverdue: sql`excluded."requests_overdue"`,
          requestsNotHeld: sql`excluded."requests_not_held"`,
          updatedAt: new Date(),
        },
      });
    total += batch.length;

    if (total % 5000 === 0 || total === entries.length) {
      logger.info(`Commune transparency: ${total}/${entries.length} upserted`);
    }
  }

  logger.info(
    `Commune transparency: ${total} upserted from ${data.size} entries`,
  );
  return { created: total };
}
