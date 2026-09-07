import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

import { createDb, mandates } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import { logger } from './logger.js';
import { fetchMadadaStats } from './sources/madada.js';
import { upsertCommuneTransparency } from './upsert/commune-transparency.js';

async function main() {
  const db = createDb();

  logger.info('=== Ingestion Madada started ===\n');

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

  const stats = await fetchMadadaStats(valid);
  const result = await upsertCommuneTransparency(db, stats);

  logger.info(`Done: ${result.created} commune transparency records upserted`);
}

main().catch((err) => {
  logger.error(String(err));
  process.exit(1);
});
