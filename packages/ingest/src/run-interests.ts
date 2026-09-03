import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchDeclarations } from './sources/hatvp.js';
import { upsertInterests } from './upsert/interests.js';
import { upsertDeclarationSnapshots } from './upsert/declaration-snapshots.js';

export async function runInterests(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion HATVP interests started ===\n');

  results.push(
    await runStep('interests', async () => {
      const declarations = await withRetry(() => fetchDeclarations(), {
        source: 'hatvp',
      });
      const r = await upsertInterests(db, declarations);
      const snap = await upsertDeclarationSnapshots(db, declarations);
      return {
        source: 'interests',
        created: r.created + snap.created,
        updated: r.updated + snap.updated,
        durationMs: 0,
      };
    }),
  );

  printSummary('Ingestion HATVP interests', results, logger);
  return results;
}
