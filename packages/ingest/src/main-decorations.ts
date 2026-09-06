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

  const byLastName = new Map<string, typeof allOfficials>();
  for (const o of allOfficials) {
    const key = normalize(o.lastName);
    const list = byLastName.get(key) ?? [];
    list.push(o);
    byLastName.set(key, list);
  }

  logger.info(`${byLastName.size} unique last names`);

  const officialByName = new Map<string, string>();
  for (const o of allOfficials) {
    const key = `${normalize(o.lastName)}|${normalize(o.firstName)}`;
    officialByName.set(key, o.id);
  }

  let searched = 0;
  let found = 0;
  let totalDecorations = 0;

  let errors = 0;

  for (const [normalLast, group] of byLastName) {
    try {
      const { results } = await searchDecorations(group[0].lastName);

      const firstNames = new Set(group.map((o) => normalize(o.firstName)));

      const batch: Parameters<typeof upsertDecorations>[1] = [];

      for (const r of results) {
        const resultName = normalize(r.intitule);
        if (!resultName.startsWith(normalLast)) continue;

        const detail = await fetchFicheDetail(r.refUnique);
        if (!detail || detail.decorations.length === 0) continue;

        const detailLast = normalize(detail.lastName);
        if (detailLast !== normalLast) continue;

        const detailFirst = normalize(detail.firstName ?? '');
        const matched = [...firstNames].some((f) => {
          if (!f || !detailFirst) return !f && !detailFirst;
          return detailFirst.startsWith(f.split(' ')[0]);
        });
        if (!matched) continue;

        batch.push(detail);
        found++;
        totalDecorations += detail.decorations.length;
      }

      if (batch.length > 0) {
        await upsertDecorations(db, batch, officialByName);
      }
    } catch (e) {
      errors++;
      logger.warn(`  Error for "${group[0].lastName}": ${e}`);
    }

    searched++;
    if (searched % 200 === 0) {
      logger.info(
        `  Progress: ${searched}/${byLastName.size} names, ${found} matched, ${totalDecorations} decorations`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  logger.info(
    `Done: ${found} officials matched, ${totalDecorations} decorations, ${errors} errors`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Decorations ingestion failed: ${error}`);
    process.exit(1);
  });
