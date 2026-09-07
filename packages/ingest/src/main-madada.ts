import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

import fs from 'node:fs';
import { createDb, mandates } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import { logger } from './logger.js';
import { fetchMadadaStats, type MadadaBody } from './sources/madada.js';
import { upsertCommuneTransparency } from './upsert/commune-transparency.js';

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

  logger.info(`Done: ${result.created} commune transparency records upserted`);

  if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
}

main().catch((err) => {
  logger.error(String(err));
  process.exit(1);
});
