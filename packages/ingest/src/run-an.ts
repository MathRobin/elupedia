import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchDeputes } from './sources/assemblee-nationale.js';
import { fetchCollaborateurs } from './sources/an-collaborateurs.js';
import { fetchAddresses } from './sources/an-adresses.js';
import { fetchActivities } from './sources/an-activite.js';
import { fetchCommittees } from './sources/an-commissions.js';
import { fetchScrutins } from './sources/an-scrutins.js';
import { upsertOfficials } from './upsert/officials.js';
import { diffAffiliations } from './upsert/affiliations-diff.js';
import { diffStaffers } from './upsert/staffers-diff.js';
import { upsertAddresses } from './upsert/addresses.js';
import { upsertParliamentaryActivity } from './upsert/parliamentary-activity.js';
import { upsertCommittees } from './upsert/committees.js';
import { upsertAnVotes } from './upsert/an-votes.js';
import { type Depute } from './sources/assemblee-nationale.js';
import { fetchLegislativeElections } from './sources/legislative-elections.js';
import { upsertLegislativeElections } from './upsert/legislative-elections.js';
export async function runAn(enabledSteps?: Set<string>): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion AN started ===\n');

  let deputes: Depute[] | undefined;

  if (enabled('deputes') || enabled('affiliations')) {
    deputes = await withRetry(() => fetchDeputes(), {
      source: 'assemblee-nationale',
    });
  }

  if (enabled('deputes')) {
    logger.info('[1/8] Députés & mandats...');
    results.push(
      await runStep('deputes', async () => {
        const officialResults = await upsertOfficials(db, deputes!);
        return {
          source: 'deputes',
          created: officialResults.length,
          updated: 0,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('affiliations')) {
    logger.info('[2/8] Affiliations politiques...');
    results.push(
      await runStep('affiliations', async () => {
        const r = await diffAffiliations(db, deputes!);
        return {
          source: 'affiliations',
          created: r.created,
          updated: r.ended,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('collaborateurs')) {
    logger.info('[3/8] Collaborateurs...');
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

  if (enabled('addresses')) {
    logger.info('[4/8] Addresses...');
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
    logger.info('[5/8] Parliamentary activity...');
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
    logger.info('[6/8] Committees...');
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

  if (enabled('votes')) {
    logger.info('[7/8] Votes (scrutins)...');
    results.push(
      await runStep('votes', async () => {
        const scrutins = await withRetry(() => fetchScrutins(), {
          source: 'an-scrutins',
        });
        const r = await upsertAnVotes(db, scrutins);
        return {
          source: 'votes',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('elections')) {
    logger.info('[8/8] Legislative election results...');
    results.push(
      await runStep('elections', async () => {
        const elections = await withRetry(() => fetchLegislativeElections(), {
          source: 'legislative-elections',
        });
        const r = await upsertLegislativeElections(db, elections);
        return {
          source: 'elections',
          created: r.elections,
          updated: r.candidates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion AN', results, logger);
  return results;
}
