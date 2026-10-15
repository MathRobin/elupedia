/**
 * Orchestration de l'ingestion du Parlement européen : eurodéputés français
 * de la législature en cours (fiche + parti national), votes par appel
 * nominal en plénière, questions parlementaires.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:europe`).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * L'API open data du PE est appelée fiche par fiche (un appel par député,
 * un par séance plénière) : chaque appel est suivi d'une pause
 * RATE_LIMIT_DELAY_MS, et les libellés d'organisations (partis nationaux)
 * sont mis en cache le temps du run pour ne pas être demandés N fois.
 */
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import {
  fetchCurrentFrenchMeps,
  fetchMepDetail,
  fetchOrganizationLabel,
} from './sources/parlement-europeen.js';
import { upsertMeps, type MepUpsertInput } from './upsert/meps.js';
import {
  fetchPlenarySittings,
  fetchRollcallDecisions,
} from './sources/parlement-europeen-votes.js';
import { upsertEuropeVotes } from './upsert/europe-votes.js';
import { upsertEuropeQuestions } from './upsert/europe-questions.js';

// Législature 10 : mandats à partir du 16/07/2024. Les séances plénières
// sont récupérées année par année depuis cette date.
const LEGISLATURE_10_START_YEAR = 2024;

// Pause après chaque appel à l'API du PE (pas de quota documenté, mais des
// 429 observés en rafale).
const RATE_LIMIT_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lance les étapes PE activées (toutes si `enabledSteps` est absent, voir
 * EUROPE_STEP_NAMES dans cli.ts). Écrit en base.
 */
export async function runEurope(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion Parlement européen started ===\n');

  if (enabled('eurodeputes')) {
    logger.info('[1/1] Eurodéputés français & mandats...');
    results.push(
      await runStep('eurodeputes', async () => {
        const meps = await withRetry(() => fetchCurrentFrenchMeps(), {
          source: 'parlement-europeen',
        });
        logger.info(`  ${meps.length} eurodéputés français trouvés`);

        // Libellé par id d'organisation : `null` mémorisé aussi, pour ne
        // pas redemander une organisation sans libellé.
        const partyLabelCache = new Map<string, string | null>();
        const inputs: MepUpsertInput[] = [];

        for (const mep of meps) {
          const detail = await withRetry(() => fetchMepDetail(fetch, mep.id), {
            source: `parlement-europeen-mep-${mep.id}`,
          });
          await sleep(RATE_LIMIT_DELAY_MS);

          let nationalPartyLabel: string | null = null;
          if (detail.currentNationalPartyOrgId) {
            if (partyLabelCache.has(detail.currentNationalPartyOrgId)) {
              nationalPartyLabel = partyLabelCache.get(
                detail.currentNationalPartyOrgId,
              )!;
            } else {
              nationalPartyLabel = await withRetry(
                () =>
                  fetchOrganizationLabel(
                    fetch,
                    detail.currentNationalPartyOrgId!,
                  ),
                {
                  source: `parlement-europeen-org-${detail.currentNationalPartyOrgId}`,
                },
              );
              partyLabelCache.set(
                detail.currentNationalPartyOrgId,
                nationalPartyLabel,
              );
              await sleep(RATE_LIMIT_DELAY_MS);
            }
          }

          inputs.push({ mep, detail, nationalPartyLabel });
        }

        const upsert = await upsertMeps(db, inputs);
        // updated = fiches existantes rattachées à un eurodéputé. Des erreurs
        // unitaires (fiche en échec) sont remontées comme erreur d'étape.
        return {
          source: 'eurodeputes',
          created: upsert.created,
          updated: upsert.linked,
          durationMs: 0,
          error: upsert.errors > 0 ? `${upsert.errors} erreur(s)` : undefined,
        };
      }),
    );
  }

  if (enabled('eurodeputes-votes')) {
    logger.info('[1/1] Votes en plénière...');
    results.push(
      await runStep('eurodeputes-votes', async () => {
        const currentYear = new Date().getFullYear();
        const sittings = [];
        for (
          let year = LEGISLATURE_10_START_YEAR;
          year <= currentYear;
          year++
        ) {
          const yearSittings = await withRetry(
            () => fetchPlenarySittings(fetch, year),
            { source: `parlement-europeen-meetings-${year}` },
          );
          sittings.push(...yearSittings);
          await sleep(RATE_LIMIT_DELAY_MS);
        }
        logger.info(`  ${sittings.length} séances plénières à vérifier`);

        // L'upsert décide lui-même quelles séances re-télécharger (déjà en
        // base ou non) : on lui passe le chargeur plutôt que les données.
        const upsert = await upsertEuropeVotes(
          db,
          sittings,
          async (sittingId) => {
            const decisions = await withRetry(
              () => fetchRollcallDecisions(fetch, sittingId),
              { source: `parlement-europeen-decisions-${sittingId}` },
            );
            await sleep(RATE_LIMIT_DELAY_MS);
            return decisions;
          },
        );

        // created = scrutins, updated = votes individuels.
        return {
          source: 'eurodeputes-votes',
          created: upsert.ballots,
          updated: upsert.votes,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('eurodeputes-questions')) {
    logger.info('[1/1] Questions parlementaires...');
    results.push(
      await runStep('eurodeputes-questions', async () => {
        const upsert = await upsertEuropeQuestions(db);
        // updated = questions rattachées à une fiche existante.
        return {
          source: 'eurodeputes-questions',
          created: upsert.created,
          updated: upsert.matched,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion Parlement européen', results, logger);
  return results;
}
