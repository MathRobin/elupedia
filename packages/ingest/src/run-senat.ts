import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchSenateurs } from './sources/senat.js';
import { upsertSenators } from './upsert/senators.js';
import { fetchSenatScrutins } from './sources/senat-scrutins.js';
import { upsertSenatVotes } from './upsert/senat-votes.js';
import { fetchSenatGroupes } from './sources/senat-groupes.js';
import { upsertSenatAffiliations } from './upsert/senat-affiliations.js';
import { fetchSenatCollaborateurs } from './sources/senat-collaborateurs.js';
import { diffSenatStaffers } from './upsert/senat-staffers-diff.js';
import { fetchSenatAdresses } from './sources/senat-adresses.js';
import { upsertSenatAddresses } from './upsert/senat-addresses.js';
import { fetchSenatElections } from './sources/senat-elections.js';
import { upsertSenatElectoralResults } from './upsert/senat-electoral-results.js';
import { fetchSenatActivities } from './sources/senat-activite.js';
import { upsertSenatParliamentaryActivity } from './upsert/senat-parliamentary-activity.js';
import { fetchSenatCommissions } from './sources/senat-commissions.js';
import { upsertSenatCommittees } from './upsert/senat-committees.js';
import { fetchSenatSocialLinks } from './sources/senat-reseaux-sociaux.js';
import { upsertSenatSocialLinks } from './upsert/senat-social-links.js';

export async function runSenat(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion Sénat started ===\n');

  if (enabled('senateurs')) {
    logger.info('[1/9] Sénateurs & mandats...');
    results.push(
      await runStep('senateurs', async () => {
        const senateurs = await withRetry(() => fetchSenateurs(), {
          source: 'senat',
        });
        const r = await upsertSenators(db, senateurs);
        return {
          source: 'senateurs',
          created: r.officials,
          updated: r.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-votes')) {
    logger.info('[2/9] Senate votes...');
    results.push(
      await runStep('senat-votes', async () => {
        const sessions = ['2020', '2021', '2022', '2023', '2024', '2025'];
        let totalBallots = 0;
        let totalVotes = 0;
        for (const session of sessions) {
          const scrutins = await withRetry(() => fetchSenatScrutins(session), {
            source: `senat-scrutins-${session}`,
          });
          const r = await upsertSenatVotes(db, scrutins);
          totalBallots += r.ballots;
          totalVotes += r.votes;
        }
        return {
          source: 'senat-votes',
          created: totalBallots,
          updated: totalVotes,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-affiliations')) {
    logger.info('[3/9] Senate affiliations...');
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

  if (enabled('senat-collaborateurs')) {
    logger.info('[4/9] Senate collaborateurs...');
    results.push(
      await runStep('senat-collaborateurs', async () => {
        const collabs = await withRetry(() => fetchSenatCollaborateurs(), {
          source: 'senat-collaborateurs',
        });
        const r = await diffSenatStaffers(db, collabs);
        return {
          source: 'senat-collaborateurs',
          created: r.created,
          updated: r.ended,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-adresses')) {
    logger.info('[5/9] Senate addresses...');
    results.push(
      await runStep('senat-adresses', async () => {
        const addr = await withRetry(() => fetchSenatAdresses(), {
          source: 'senat-adresses',
        });
        const r = await upsertSenatAddresses(db, addr);
        return {
          source: 'senat-adresses',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-elections')) {
    logger.info('[6/9] Senate electoral results...');
    results.push(
      await runStep('senat-elections', async () => {
        const elec = await withRetry(() => fetchSenatElections('2023'), {
          source: 'senat-elections',
        });
        const r = await upsertSenatElectoralResults(db, elec);
        return {
          source: 'senat-elections',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-commissions')) {
    logger.info('[7/9] Senate commissions & delegations...');
    results.push(
      await runStep('senat-commissions', async () => {
        const comms = await withRetry(() => fetchSenatCommissions(), {
          source: 'senat-commissions',
        });
        const r = await upsertSenatCommittees(db, comms);
        return {
          source: 'senat-commissions',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-activite')) {
    logger.info('[8/9] Senate parliamentary activity...');
    results.push(
      await runStep('senat-activite', async () => {
        const activities = await withRetry(() => fetchSenatActivities(), {
          source: 'senat-activite',
        });
        const r = await upsertSenatParliamentaryActivity(db, activities);
        return {
          source: 'senat-activite',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-social-links')) {
    logger.info('[9/9] Senate social links...');
    results.push(
      await runStep('senat-social-links', async () => {
        const links = await withRetry(() => fetchSenatSocialLinks(), {
          source: 'senat-social-links',
        });
        const r = await upsertSenatSocialLinks(db, links);
        return {
          source: 'senat-social-links',
          created: r.created,
          updated: r.updated,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion Sénat', results, logger);
  return results;
}
