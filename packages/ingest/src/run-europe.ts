/**
 * Orchestration de l'ingestion du Parlement européen : eurodéputés français
 * de la législature en cours (fiche + parti national), votes par appel
 * nominal en plénière, questions parlementaires, registre de présence des
 * séances plénières.
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
import {
  upsertMeps,
  closeDepartedMepMandates,
  type MepUpsertInput,
} from './upsert/meps.js';
import {
  fetchPlenarySittings,
  fetchRollcallDecisions,
  type PlenarySitting,
} from './sources/parlement-europeen-votes.js';
import { fetchSittingAttendance } from './sources/parlement-europeen-presence.js';
import {
  upsertEuropeVotes,
  loadOfficialIdsByEuroparlId,
} from './upsert/europe-votes.js';
import { upsertEuropePresence } from './upsert/europe-presence.js';
import { upsertEuropeQuestions } from './upsert/europe-questions.js';
import {
  loadMepGapInputs,
  buildMepGapReport,
  formatMepGapReport,
} from './compute/mep-gap-report.js';

// Législature 10 : mandats à partir du 16/07/2024. Les séances plénières
// sont récupérées année par année depuis cette date.
const LEGISLATURE_10_START_YEAR = 2024;

// Les séances sont demandées par année : 2024 renvoie aussi celles de la
// législature 9 (15/01 → 25/04/2024). L'étape « présence » les écarte, parce
// que tous les mandats `eurodepute` en base commencent le 16/07/2024 ou
// après : aucune de ces signatures n'entre dans une fenêtre de calcul, et les
// écrire remplirait la table de lignes qu'aucun compteur ne lit. L'étape
// « votes » garde l'année entière, ses scrutins antérieurs étant déjà en base.
const LEGISLATURE_10_START_DATE = '2024-07-16';

// Pause après chaque appel à l'API du PE (pas de quota documenté, mais des
// 429 observés en rafale).
const RATE_LIMIT_DELAY_MS = 150;

// L'étape « présence » parcourt les séances de la législature sur le SEUL
// endpoint /meetings/{id} (134 au 20/11/2026, dont 8 encore à venir) : à
// 150 ms, l'API répond 429 au bout d'une soixantaine d'appels (constaté le
// 18/11/2026). La limite documentée est de 500 requêtes
// par 5 minutes et par endpoint, soit 600 ms en moyenne soutenue : même délai
// que l'étape « questions ». Seul le premier run paie ce prix, les séances
// définitives étant ensuite marquées et sautées sans appel réseau.
const PRESENCE_RATE_LIMIT_DELAY_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Séances plénières de la législature 10, année par année depuis 2024 :
 * l'API ne filtre que par année. Partagé par les étapes « votes » et
 * « présence », qui parcourent les mêmes séances.
 */
async function fetchLegislatureSittings(): Promise<PlenarySitting[]> {
  const currentYear = new Date().getFullYear();
  const sittings: PlenarySitting[] = [];
  for (let year = LEGISLATURE_10_START_YEAR; year <= currentYear; year++) {
    const yearSittings = await withRetry(
      () => fetchPlenarySittings(fetch, year),
      { source: `parlement-europeen-meetings-${year}` },
    );
    sittings.push(...yearSittings);
    await sleep(RATE_LIMIT_DELAY_MS);
  }
  return sittings;
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
        const sittings = await fetchLegislatureSittings();
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

  if (enabled('eurodeputes-presence')) {
    logger.info('[1/1] Registre de présence en plénière...');
    results.push(
      await runStep('eurodeputes-presence', async () => {
        // 1. Réconciliation des mandats avant tout calcul : `upsertMeps` ne
        // voit que les élus en exercice et laisse ouvert le mandat d'un
        // sortant. Une fenêtre de mandat fausse donnerait des compteurs faux,
        // d'où la clôture ici plutôt que dans l'étape « eurodeputes », qui
        // n'est pas forcément jouée avec celle-ci.
        const currentMeps = await withRetry(() => fetchCurrentFrenchMeps(), {
          source: 'parlement-europeen',
        });
        const closed = await closeDepartedMepMandates(
          db,
          new Set(currentMeps.map((mep) => mep.id)),
          async (europarlId) => {
            const detail = await withRetry(
              () => fetchMepDetail(fetch, europarlId),
              { source: `parlement-europeen-mep-${europarlId}` },
            );
            await sleep(RATE_LIMIT_DELAY_MS);
            return detail.currentParliamentaryMandate?.endDate ?? null;
          },
        );
        if (closed.closed > 0 || closed.unknownEndDate > 0) {
          logger.info(
            `  ${closed.closed} mandat(s) de sortant fermé(s), ${closed.unknownEndDate} sans date de fin publiée`,
          );
        }

        // 2. Signatures du registre, séance par séance (législature 10 seule).
        const sittings = (await fetchLegislatureSittings()).filter(
          (sitting) => sitting.date >= LEGISLATURE_10_START_DATE,
        );
        logger.info(`  ${sittings.length} séances plénières à vérifier`);

        const officialIdByEuroparlId = await loadOfficialIdsByEuroparlId(db);
        const upsert = await upsertEuropePresence(
          db,
          sittings,
          async (sittingId) => {
            const attendance = await withRetry(
              () => fetchSittingAttendance(fetch, sittingId),
              { source: `parlement-europeen-presence-${sittingId}` },
            );
            await sleep(PRESENCE_RATE_LIMIT_DELAY_MS);
            return attendance;
          },
          officialIdByEuroparlId,
        );

        // 3. Rapport d'écart de participation (lecture seule) : compteurs par
        // élu et anomalies, pour vérifier le résultat sans ouvrir la base.
        const report = buildMepGapReport(await loadMepGapInputs(db));
        for (const line of formatMepGapReport(report)) logger.info(line);

        // created = signatures écrites, updated = mandats de sortants fermés.
        return {
          source: 'eurodeputes-presence',
          created: upsert.signatures,
          updated: closed.closed,
          durationMs: 0,
          error:
            report.unmatched.length > 0
              ? `${report.unmatched.length} mandat(s) sans identifiant europarl`
              : undefined,
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
