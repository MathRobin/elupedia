import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchRneMaires } from './sources/rne-maires.js';
import { upsertMayors } from './upsert/mayors.js';
import { fetchDilaMairies } from './sources/dila-mairies.js';
import { upsertMayorAddresses } from './upsert/mayor-addresses.js';
import { scrapeMayorWebsites } from './upsert/mayor-social-scrape.js';
import { fetchWikidataMayorPhotos } from './sources/wikidata-mayor-photos.js';
import { upsertMayorPhotos } from './upsert/mayor-photos.js';

export async function runMaires(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion Maires started ===\n');

  if (enabled('maires')) {
    logger.info('[1/4] RNE maires...');
    results.push(
      await runStep('maires', async () => {
        const maires = await withRetry(() => fetchRneMaires(), {
          source: 'rne-maires',
        });
        const r = await upsertMayors(db, maires);
        return {
          source: 'maires',
          created: r.officials,
          updated: r.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('maires-addresses')) {
    logger.info('[2/4] DILA mairie addresses...');
    results.push(
      await runStep('maires-addresses', async () => {
        const mairies = await withRetry(() => fetchDilaMairies(), {
          source: 'dila-mairies',
        });
        const r = await upsertMayorAddresses(db, mairies);
        return {
          source: 'maires-addresses',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('maires-photos')) {
    logger.info('[3/4] Wikidata mayor photos...');
    results.push(
      await runStep('maires-photos', async () => {
        const photos = await withRetry(() => fetchWikidataMayorPhotos(), {
          source: 'wikidata-mayor-photos',
        });
        const r = await upsertMayorPhotos(db, photos);
        return {
          source: 'maires-photos',
          created: r.updated,
          updated: r.matched,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('maires-social-scrape')) {
    logger.info('[4/4] Mayor website social links scrape...');
    results.push(
      await runStep('maires-social-scrape', async () => {
        const r = await scrapeMayorWebsites(db);
        return {
          source: 'maires-social-scrape',
          created: r.created,
          updated: r.skipped,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion Maires', results, logger);
  return results;
}
