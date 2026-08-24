import { createDb } from '@elupedia/shared';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { fetchDeputes } from './sources/assemblee-nationale.js';
import { fetchCollaborateurs } from './sources/an-collaborateurs.js';
import { fetchDeclarations } from './sources/hatvp.js';
import { fetchAddresses } from './sources/an-adresses.js';
import { fetchActivities } from './sources/an-activite.js';
import { fetchCommittees } from './sources/an-commissions.js';
// import { fetchElectionResults } from './sources/datagouv-elections.js';
import { upsertOfficials } from './upsert/officials.js';
import { diffStaffers } from './upsert/staffers-diff.js';
import { upsertInterests } from './upsert/interests.js';
import { upsertAddresses } from './upsert/addresses.js';
import { upsertParliamentaryActivity } from './upsert/parliamentary-activity.js';
import { upsertCommittees } from './upsert/committees.js';
import { fetchSenateurs } from './sources/senat.js';
import { upsertSenators } from './upsert/senators.js';
import { fetchSenatScrutins } from './sources/senat-scrutins.js';
import { upsertSenatVotes } from './upsert/senat-votes.js';
import { fetchSenatGroupes } from './sources/senat-groupes.js';
import { upsertSenatAffiliations } from './upsert/senat-affiliations.js';
// import { upsertElectoralResults } from './upsert/electoral-results.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

interface StepResult {
  source: string;
  created: number;
  updated: number;
  durationMs: number;
  error?: string;
}

function humanDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return rem > 0 ? `${m}min ${rem}s` : `${m}min`;
}

async function runStep(
  source: string,
  fn: () => Promise<StepResult>,
): Promise<StepResult> {
  const start = performance.now();
  try {
    const result = await withRetry(fn, { source });
    result.durationMs = Math.round(performance.now() - start);
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      source,
      created: 0,
      updated: 0,
      durationMs: Math.round(performance.now() - start),
      error: msg,
    };
  }
}

export async function run(enabledSteps?: Set<string>) {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion started ===\n');

  if (enabled('officials')) {
    logger.info('[1/7] Officials & mandates...');
    const step1 = await runStep('officials', async () => {
      const deputes = await withRetry(() => fetchDeputes(), {
        source: 'assemblee-nationale',
      });
      const officialResults = await upsertOfficials(db, deputes);
      return {
        source: 'officials',
        created: officialResults.length,
        updated: 0,
        durationMs: 0,
      };
    });
    results.push(step1);
  }

  if (enabled('collaborateurs')) {
    logger.info('[2/7] Collaborateurs...');
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
    logger.info('[3/7] Interests (HATVP)...');
    results.push(
      await runStep('interests', async () => {
        const declarations = await withRetry(() => fetchDeclarations(), {
          source: 'hatvp',
        });
        const r = await upsertInterests(db, declarations);
        return {
          source: 'interests',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('addresses')) {
    logger.info('[4/7] Addresses...');
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
    logger.info('[5/7] Parliamentary activity...');
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
    logger.info('[6/7] Committees...');
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

  if (enabled('senators')) {
    logger.info('[7/7] Senators & mandates...');
    results.push(
      await runStep('senators', async () => {
        const senateurs = await withRetry(() => fetchSenateurs(), {
          source: 'senat',
        });
        const r = await upsertSenators(db, senateurs);
        return {
          source: 'senators',
          created: r.officials,
          updated: r.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-votes')) {
    logger.info('[8/8] Senate votes...');
    results.push(
      await runStep('senat-votes', async () => {
        const scrutins = await withRetry(
          () => fetchSenatScrutins('2025'),
          { source: 'senat-scrutins' },
        );
        const r = await upsertSenatVotes(db, scrutins);
        return {
          source: 'senat-votes',
          created: r.ballots,
          updated: r.votes,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-affiliations')) {
    logger.info('[9/9] Senate affiliations...');
    results.push(
      await runStep('senat-affiliations', async () => {
        const groupes = await withRetry(() => fetchSenatGroupes(), {
          source: 'senat-groupes',
        });
        const r = await upsertSenatAffiliations(db, groupes);
        return {
          source: 'senat-affiliations',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  // TODO: étape résultats électoraux désactivée — source API à câbler
  // logger.info('[7/7] Electoral results...');
  // results.push(
  //   await runStep('electoral-results', async () => {
  //     const elec = await withRetry(() => fetchElectionResults(), {
  //       source: 'datagouv-elections',
  //     });
  //     const r = await upsertElectoralResults(db, elec);
  //     return {
  //       source: 'electoral-results',
  //       created: r.created,
  //       updated: r.updated,
  //     };
  //   }),
  // );

  logger.info('\n=== Ingestion summary ===');
  const errors = results.filter((r) => r.error);
  for (const r of results) {
    const status = r.error ? `ERROR: ${r.error}` : 'OK';
    logger.info(
      `  ${r.source}: ${r.created} created, ${r.updated} updated — ${status} (${humanDuration(r.durationMs)})`,
    );
  }
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  logger.info(
    `\nTotal: ${results.length} sources, ${errors.length} error(s), ${humanDuration(totalMs)}`,
  );

  return results;
}
