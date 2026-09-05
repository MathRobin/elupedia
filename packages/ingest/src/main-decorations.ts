import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

import { createDb } from '@elupedia/shared';
import { officials } from '@elupedia/shared';
import { logger } from './logger.js';
import {
  searchDecorations,
  fetchFicheDetail,
} from './sources/legion-honneur.js';
import { upsertDecorations } from './upsert/decorations.js';

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

async function main() {
  const db = createDb();

  const allOfficials = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials);

  logger.info(`${allOfficials.length} officials to look up`);

  let searched = 0;
  let found = 0;
  let totalDecorations = 0;
  const allRecords: Parameters<typeof upsertDecorations>[1] = [];

  for (const official of allOfficials) {
    const { results } = await searchDecorations(official.lastName);

    const normalLast = normalize(official.lastName);
    const normalFirst = normalize(official.firstName);

    for (const r of results) {
      const detail = await fetchFicheDetail(r.refUnique);
      if (!detail || detail.decorations.length === 0) continue;

      const detailLast = normalize(detail.lastName);
      const detailFirst = normalize(detail.firstName ?? '');

      if (detailLast !== normalLast) continue;
      if (
        normalFirst &&
        detailFirst &&
        !detailFirst.startsWith(normalFirst.split(' ')[0])
      )
        continue;

      allRecords.push(detail);
      found++;
      totalDecorations += detail.decorations.length;
    }

    searched++;
    if (searched % 100 === 0) {
      logger.info(
        `  Progress: ${searched}/${allOfficials.length} officials searched, ${found} matched, ${totalDecorations} decorations`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  logger.info(
    `Search complete: ${found} officials matched, ${totalDecorations} decorations found`,
  );

  if (allRecords.length > 0) {
    await upsertDecorations(db, allRecords);
  }

  logger.info('Done');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Decorations ingestion failed: ${error}`);
    process.exit(1);
  });
