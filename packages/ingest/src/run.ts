import { createDb } from '@elupedia/shared';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { withRetry } from './utils/retry.js';
import { fetchDeputes } from './sources/assemblee-nationale.js';
import { fetchCollaborateurs } from './sources/an-collaborateurs.js';
import { fetchDeclarations } from './sources/hatvp.js';
import { fetchAddresses } from './sources/an-adresses.js';
import { fetchActivities } from './sources/an-activite.js';
import { fetchCommittees } from './sources/an-commissions.js';
import { fetchElectionResults } from './sources/datagouv-elections.js';
import { upsertOfficials } from './upsert/officials.js';
import { diffStaffers } from './upsert/staffers-diff.js';
import { upsertInterests } from './upsert/interests.js';
import { upsertAddresses } from './upsert/addresses.js';
import { upsertParliamentaryActivity } from './upsert/parliamentary-activity.js';
import { upsertCommittees } from './upsert/committees.js';
import { upsertElectoralResults } from './upsert/electoral-results.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

interface StepResult {
  source: string;
  created: number;
  updated: number;
  error?: string;
}

async function runStep(
  source: string,
  fn: () => Promise<StepResult>,
): Promise<StepResult> {
  try {
    return await withRetry(fn, { source });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { source, created: 0, updated: 0, error: msg };
  }
}

export async function run() {
  const db = createDb();
  const results: StepResult[] = [];

  console.log('=== Ingestion started ===\n');

  console.log('[1/7] Officials & mandates...');
  const step1 = await runStep('officials', async () => {
    const deputes = await withRetry(() => fetchDeputes(), {
      source: 'assemblee-nationale',
    });
    const officialResults = await upsertOfficials(db, deputes);
    return { source: 'officials', created: officialResults.length, updated: 0 };
  });
  results.push(step1);

  console.log('[2/7] Collaborateurs...');
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
      };
    }),
  );

  console.log('[3/7] Interests (HATVP)...');
  results.push(
    await runStep('interests', async () => {
      const declarations = await withRetry(() => fetchDeclarations(), {
        source: 'hatvp',
      });
      const r = await upsertInterests(db, declarations);
      return { source: 'interests', created: r.created, updated: r.updated };
    }),
  );

  console.log('[4/7] Addresses...');
  results.push(
    await runStep('addresses', async () => {
      const addr = await withRetry(() => fetchAddresses(), {
        source: 'an-adresses',
      });
      const r = await upsertAddresses(db, addr);
      return { source: 'addresses', created: r.created, updated: r.updated };
    }),
  );

  console.log('[5/7] Parliamentary activity...');
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
      };
    }),
  );

  console.log('[6/7] Committees...');
  results.push(
    await runStep('committees', async () => {
      const comm = await withRetry(() => fetchCommittees(), {
        source: 'an-commissions',
      });
      const r = await upsertCommittees(db, comm);
      return { source: 'committees', created: r.created, updated: r.updated };
    }),
  );

  console.log('[7/7] Electoral results...');
  results.push(
    await runStep('electoral-results', async () => {
      const elec = await withRetry(() => fetchElectionResults(), {
        source: 'datagouv-elections',
      });
      const r = await upsertElectoralResults(db, elec);
      return {
        source: 'electoral-results',
        created: r.created,
        updated: r.updated,
      };
    }),
  );

  console.log('\n=== Ingestion summary ===');
  const errors = results.filter((r) => r.error);
  for (const r of results) {
    const status = r.error ? `ERROR: ${r.error}` : 'OK';
    console.log(
      `  ${r.source}: ${r.created} created, ${r.updated} updated — ${status}`,
    );
  }
  console.log(`\nTotal: ${results.length} sources, ${errors.length} error(s)`);

  return results;
}
