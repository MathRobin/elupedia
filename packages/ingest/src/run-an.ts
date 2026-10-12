/**
 * Orchestration de l'ingestion Assemblée nationale : 8 étapes (députés et
 * mandats, affiliations, collaborateurs, adresses, activité parlementaire,
 * commissions, scrutins, résultats des législatives), chacune = une source
 * open data AN + l'upsert correspondant.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:an`) et par run.ts (run complet).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * L'export des acteurs AN (fetchDeputes) est volumineux : il n'est chargé
 * qu'une fois et partagé entre les étapes `deputes` et `affiliations`.
 * Attention, le nom d'étape CLI et le `source` du StepResult diffèrent pour
 * l'activité (`activity` vs `parliamentary-activity`).
 */
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

/**
 * Lance les étapes AN activées (toutes si `enabledSteps` est absent, voir
 * AN_STEP_NAMES dans cli.ts). Écrit en base.
 */
export async function runAn(enabledSteps?: Set<string>): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion AN started ===\n');

  // Chargé une seule fois pour les deux étapes qui en dépendent ; le `!`
  // plus bas est garanti par cette même condition.
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
        const diff = await diffAffiliations(db, deputes!);
        // updated = affiliations closes (date de fin posée).
        return {
          source: 'affiliations',
          created: diff.created,
          updated: diff.ended,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('collaborateurs')) {
    logger.info('[3/8] Collaborateurs...');
    results.push(
      await runStep('collaborateurs', async () => {
        const collaborateurs = await withRetry(() => fetchCollaborateurs(), {
          source: 'an-collaborateurs',
        });
        const diff = await diffStaffers(db, collaborateurs);
        // updated = contrats clos (date de fin posée).
        return {
          source: 'collaborateurs',
          created: diff.created,
          updated: diff.ended,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('addresses')) {
    logger.info('[4/8] Addresses...');
    results.push(
      await runStep('addresses', async () => {
        const addresses = await withRetry(() => fetchAddresses(), {
          source: 'an-adresses',
        });
        const upsert = await upsertAddresses(db, addresses);
        return {
          source: 'addresses',
          created: upsert.created,
          updated: upsert.updated,
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
        const upsert = await upsertParliamentaryActivity(db, activities);
        return {
          source: 'parliamentary-activity',
          created: upsert.created,
          updated: upsert.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('committees')) {
    logger.info('[6/8] Committees...');
    results.push(
      await runStep('committees', async () => {
        const committees = await withRetry(() => fetchCommittees(), {
          source: 'an-commissions',
        });
        const upsert = await upsertCommittees(db, committees);
        return {
          source: 'committees',
          created: upsert.created,
          updated: upsert.updated,
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
        const upsert = await upsertAnVotes(db, scrutins);
        return {
          source: 'votes',
          created: upsert.created,
          updated: upsert.updated,
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
        const upsert = await upsertLegislativeElections(db, elections);
        // created = scrutins, updated = candidatures.
        return {
          source: 'elections',
          created: upsert.elections,
          updated: upsert.candidates,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion AN', results, logger);
  return results;
}
