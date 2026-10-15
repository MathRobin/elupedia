/**
 * Orchestration de l'ingestion Sénat : 9 étapes (sénateurs et mandats,
 * scrutins, groupes politiques, collaborateurs, adresses, résultats des
 * sénatoriales, commissions et délégations, activité parlementaire, réseaux
 * sociaux), chacune = une source open data Sénat + l'upsert correspondant.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:senat`) et par run.ts (run complet).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * Les scrutins sont publiés par session parlementaire (une archive par
 * année) : SENAT_VOTE_SESSIONS doit être étendue à chaque nouvelle session.
 */
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
import {
  fetchSenatElectedResults,
  fetchSenatDepartementResults,
} from './sources/senat-elections.js';
import { upsertSenatElectoralResults } from './upsert/senat-electoral-results.js';
import { upsertSenatorialElections } from './upsert/senatorial-elections.js';
import { fetchSenatActivities } from './sources/senat-activite.js';
import { upsertSenatParliamentaryActivity } from './upsert/senat-parliamentary-activity.js';
import { fetchSenatCommissions } from './sources/senat-commissions.js';
import { upsertSenatCommittees } from './upsert/senat-committees.js';
import { fetchSenatSocialLinks } from './sources/senat-reseaux-sociaux.js';
import { upsertSenatSocialLinks } from './upsert/senat-social-links.js';

// Sessions parlementaires dont on ingère les scrutins (une archive par
// session côté Sénat). À étendre chaque année.
const SENAT_VOTE_SESSIONS = ['2020', '2021', '2022', '2023', '2024', '2025'];

// Dernier renouvellement sénatorial dont les résultats sont publiés en open
// data (série 1, septembre 2023). Le renouvellement 2026 passe par
// run-senat-resultats.ts.
const SENAT_ELECTIONS_YEAR = '2023';

/**
 * Lance les étapes Sénat activées (toutes si `enabledSteps` est absent, voir
 * SENAT_STEP_NAMES dans cli.ts). Écrit en base.
 */
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
        const upsert = await upsertSenators(db, senateurs);
        // created = fiches officials touchées, updated = mandats touchés.
        return {
          source: 'senateurs',
          created: upsert.officials,
          updated: upsert.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-votes')) {
    logger.info('[2/9] Senate votes...');
    results.push(
      await runStep('senat-votes', async () => {
        let totalBallots = 0;
        let totalVotes = 0;
        for (const session of SENAT_VOTE_SESSIONS) {
          const scrutins = await withRetry(() => fetchSenatScrutins(session), {
            source: `senat-scrutins-${session}`,
          });
          const upsert = await upsertSenatVotes(db, scrutins);
          totalBallots += upsert.ballots;
          totalVotes += upsert.votes;
        }
        // created = scrutins, updated = votes individuels.
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
        const upsert = await upsertSenatAffiliations(db, groupes);
        return {
          source: 'senat-affiliations',
          created: upsert.created,
          updated: upsert.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-collaborateurs')) {
    logger.info('[4/9] Senate collaborateurs...');
    results.push(
      await runStep('senat-collaborateurs', async () => {
        const collaborateurs = await withRetry(
          () => fetchSenatCollaborateurs(),
          { source: 'senat-collaborateurs' },
        );
        const diff = await diffSenatStaffers(db, collaborateurs);
        // updated = contrats clos (date de fin posée).
        return {
          source: 'senat-collaborateurs',
          created: diff.created,
          updated: diff.ended,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-adresses')) {
    logger.info('[5/9] Senate addresses...');
    results.push(
      await runStep('senat-adresses', async () => {
        const adresses = await withRetry(() => fetchSenatAdresses(), {
          source: 'senat-adresses',
        });
        const upsert = await upsertSenatAddresses(db, adresses);
        return {
          source: 'senat-adresses',
          created: upsert.created,
          updated: upsert.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-elections')) {
    logger.info('[6/9] Senate electoral results...');
    results.push(
      await runStep('senat-elections', async () => {
        // Deux jeux de données pour le même scrutin : le score des élus
        // (electoral_results, rattaché à la fiche) et le détail complet par
        // circonscription avec tous les candidats (senatorial_elections).
        const electedResults = await withRetry(
          () => fetchSenatElectedResults(SENAT_ELECTIONS_YEAR),
          { source: 'senat-elections' },
        );
        const electedUpsert = await upsertSenatElectoralResults(
          db,
          electedResults,
        );

        const fullElections = await withRetry(
          () => fetchSenatDepartementResults(SENAT_ELECTIONS_YEAR),
          { source: 'senat-elections-full' },
        );
        const fullUpsert = await upsertSenatorialElections(db, fullElections);

        return {
          source: 'senat-elections',
          created: electedUpsert.created + fullUpsert.elections,
          updated: electedUpsert.updated + fullUpsert.candidates,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('senat-commissions')) {
    logger.info('[7/9] Senate commissions & delegations...');
    results.push(
      await runStep('senat-commissions', async () => {
        const commissions = await withRetry(() => fetchSenatCommissions(), {
          source: 'senat-commissions',
        });
        const upsert = await upsertSenatCommittees(db, commissions);
        return {
          source: 'senat-commissions',
          created: upsert.created,
          updated: upsert.updated,
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
        const upsert = await upsertSenatParliamentaryActivity(db, activities);
        return {
          source: 'senat-activite',
          created: upsert.created,
          updated: upsert.updated,
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
        const upsert = await upsertSenatSocialLinks(db, links);
        return {
          source: 'senat-social-links',
          created: upsert.created,
          updated: upsert.updated,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion Sénat', results, logger);
  return results;
}
