import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchDeputes } from './sources/assemblee-nationale.js';
import { fetchCollaborateurs } from './sources/an-collaborateurs.js';
import { fetchDeclarations } from './sources/hatvp.js';
import { fetchAddresses } from './sources/an-adresses.js';
import { fetchActivities } from './sources/an-activite.js';
import { fetchCommittees } from './sources/an-commissions.js';
import { upsertOfficials } from './upsert/officials.js';
import { diffStaffers } from './upsert/staffers-diff.js';
import { upsertInterests } from './upsert/interests.js';
import { upsertDeclarationSnapshots } from './upsert/declaration-snapshots.js';
import { upsertAddresses } from './upsert/addresses.js';
import { upsertParliamentaryActivity } from './upsert/parliamentary-activity.js';
import { upsertCommittees } from './upsert/committees.js';
export async function runAn(enabledSteps?: Set<string>): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion AN started ===\n');

  if (enabled('deputes')) {
    logger.info('[1/6] Députés & mandats...');
    results.push(
      await runStep('deputes', async () => {
        const deputes = await withRetry(() => fetchDeputes(), {
          source: 'assemblee-nationale',
        });
        const officialResults = await upsertOfficials(db, deputes);
        return {
          source: 'deputes',
          created: officialResults.length,
          updated: 0,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('collaborateurs')) {
    logger.info('[2/6] Collaborateurs...');
    results.push(
      await runStep('collaborateurs', async () => {
        const collabs = await withRetry(() => fetchCollaborateurs(), {
          source: 'an-collaborateurs',
        });
        const r = await diffStaffers(db, collabs);
        return {
          source: 'collaborateurs',
          created: r.created,
          updated: r.ended,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('interests')) {
    logger.info('[3/6] Interests (HATVP)...');
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
  }

  if (enabled('addresses')) {
    logger.info('[4/6] Addresses...');
    results.push(
      await runStep('addresses', async () => {
        const addr = await withRetry(() => fetchAddresses(), {
          source: 'an-adresses',
        });
        const r = await upsertAddresses(db, addr);
        return {
          source: 'addresses',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('activity')) {
    logger.info('[5/6] Parliamentary activity...');
    results.push(
      await runStep('parliamentary-activity', async () => {
        const activities = await withRetry(() => fetchActivities(), {
          source: 'an-activite',
        });
        const r = await upsertParliamentaryActivity(db, activities);
        return {
          source: 'parliamentary-activity',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('committees')) {
    logger.info('[6/6] Committees...');
    results.push(
      await runStep('committees', async () => {
        const comm = await withRetry(() => fetchCommittees(), {
          source: 'an-commissions',
        });
        const r = await upsertCommittees(db, comm);
        return {
          source: 'committees',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion AN', results, logger);
  return results;
}
