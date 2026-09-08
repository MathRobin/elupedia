import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

import fs from 'node:fs';
import { createDb, mandates, communeTransparency } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import { logger } from './logger.js';
import { fetchMadadaStats, type MadadaBody } from './sources/madada.js';
import { upsertCommuneTransparency } from './upsert/commune-transparency.js';
import { fetchMadadaRequests } from './sources/madada-requests.js';
import { upsertMadadaRequests } from './upsert/madada-requests.js';

const CACHE_PATH = path.resolve(__dirname, '../madada-cache.json');

async function main() {
  const db = createDb();

  logger.info('=== Ingestion Madada started ===\n');

  let stats: Map<string, MadadaBody>;

  if (fs.existsSync(CACHE_PATH)) {
    logger.info(`Loading cached data from ${CACHE_PATH}`);
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as [
      string,
      MadadaBody,
    ][];
    stats = new Map(raw);
    logger.info(`Loaded ${stats.size} entries from cache`);
  } else {
    const communes = await db
      .selectDistinct({
        communeCode: mandates.communeCode,
        communeName: mandates.district,
      })
      .from(mandates)
      .where(eq(mandates.type, 'maire'));

    const valid = communes.filter(
      (c): c is { communeCode: string; communeName: string } =>
        c.communeCode != null && c.communeName != null,
    );

    logger.info(`Found ${valid.length} distinct communes with maires`);

    stats = await fetchMadadaStats(valid);

    fs.writeFileSync(CACHE_PATH, JSON.stringify([...stats.entries()]));
    logger.info(`Cached ${stats.size} entries to ${CACHE_PATH}`);
  }

  const result = await upsertCommuneTransparency(db, stats);
  logger.info(
    `Step 1: ${result.created} commune transparency records upserted`,
  );

  // Step 2: fetch individual requests with dates for communes that have MaDaDa data
  logger.info('\n--- Step 2: individual requests ---');
  const rows = await db
    .select({
      communeCode: communeTransparency.communeCode,
      madadaUrlName: communeTransparency.madadaUrlName,
    })
    .from(communeTransparency);

  logger.info(`  ${rows.length} communes with MaDaDa data`);
  let totalRequests = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const { communeCode, madadaUrlName } = rows[i];
    try {
      const requests = await fetchMadadaRequests(madadaUrlName);
      if (requests.length > 0) {
        await upsertMadadaRequests(db, communeCode, requests);
        totalRequests += requests.length;
      }
    } catch (e) {
      errors++;
      logger.warn(`  Error for ${madadaUrlName}: ${e}`);
    }

    if ((i + 1) % 50 === 0) {
      logger.info(
        `  Progress: ${i + 1}/${rows.length} (${totalRequests} requests)`,
      );
    }
  }

  logger.info(
    `Step 2: ${totalRequests} individual requests upserted (${errors} errors)`,
  );

  if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
}

main().catch((err) => {
  logger.error(String(err));
  process.exit(1);
});
