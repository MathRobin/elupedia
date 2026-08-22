import { createDb } from '@elupedia/shared';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { withRetry } from './utils/retry.js';
import { fetchDeputes } from './sources/nosdeputes.js';
import { fetchVotesForDepute } from './sources/nosdeputes-votes.js';
import { fetchCollaborateurs } from './sources/an-collaborateurs.js';
import { fetchAffiliations } from './sources/nosdeputes-affiliations.js';
import { fetchDeclarations } from './sources/hatvp.js';
import { fetchAddresses } from './sources/an-adresses.js';
import { fetchActivities } from './sources/an-activite.js';
import { fetchCommittees } from './sources/an-commissions.js';
import { fetchElectionResults } from './sources/datagouv-elections.js';
import { upsertOfficials } from './upsert/officials.js';
import { upsertVotes } from './upsert/votes.js';
import { diffStaffers } from './upsert/staffers-diff.js';
import { diffAffiliations } from './upsert/affiliations-diff.js';
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

  console.log('[1/9] Officials & mandates...');
  let deputes: Awaited<ReturnType<typeof fetchDeputes>> = [];
  let officialResults: Awaited<ReturnType<typeof upsertOfficials>> = [];
  const step1 = await runStep('officials', async () => {
    deputes = await withRetry(() => fetchDeputes(), {
      source: 'nosdeputes',
    });
    officialResults = await upsertOfficials(db, deputes);
    return { source: 'officials', created: officialResults.length, updated: 0 };
  });
  results.push(step1);

  console.log('[2/9] Votes...');
  if (step1.error) {
    results.push({
      source: 'votes',
      created: 0,
      updated: 0,
      error: 'skipped: officials fetch failed',
    });
  } else {
    results.push(
      await runStep('votes', async () => {
        let created = 0;
        const updated = 0;
        for (const official of officialResults) {
          const depute = deputes.find(
            (d) => (d.id_an ?? `nosdeputes-${d.id}`) === official.anId,
          );
          if (!depute) continue;
          const voteDetails = await withRetry(
            () => fetchVotesForDepute(depute.slug),
            { source: `votes/${depute.slug}` },
          );
          const r = await upsertVotes(db, official.officialId, voteDetails);
          created += r.length;
        }
        return { source: 'votes', created, updated };
      }),
    );
  }

  console.log('[3/9] Collaborateurs...');
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

  console.log('[4/9] Affiliations...');
  if (step1.error) {
    results.push({
      source: 'affiliations',
      created: 0,
      updated: 0,
      error: 'skipped: officials fetch failed',
    });
  } else {
    results.push(
      await runStep('affiliations', async () => {
        const affiliations = await withRetry(() => fetchAffiliations(), {
          source: 'nosdeputes-affiliations',
        });
        const r = await diffAffiliations(db, affiliations);
        return {
          source: 'affiliations',
          created: r.created,
          updated: r.ended,
        };
      }),
    );
  }

  console.log('[5/9] Interests (HATVP)...');
  results.push(
    await runStep('interests', async () => {
      const declarations = await withRetry(() => fetchDeclarations(), {
        source: 'hatvp',
      });
      const r = await upsertInterests(db, declarations);
      return { source: 'interests', created: r.created, updated: r.updated };
    }),
  );

  console.log('[6/9] Addresses...');
  results.push(
    await runStep('addresses', async () => {
      const addr = await withRetry(() => fetchAddresses(), {
        source: 'an-adresses',
      });
      const r = await upsertAddresses(db, addr);
      return { source: 'addresses', created: r.created, updated: r.updated };
    }),
  );

  console.log('[7/9] Parliamentary activity...');
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

  console.log('[8/9] Committees...');
  results.push(
    await runStep('committees', async () => {
      const comm = await withRetry(() => fetchCommittees(), {
        source: 'an-commissions',
      });
      const r = await upsertCommittees(db, comm);
      return { source: 'committees', created: r.created, updated: r.updated };
    }),
  );

  console.log('[9/9] Electoral results...');
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
