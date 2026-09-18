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

const RATE_LIMIT_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

        const r = await upsertMeps(db, inputs);
        return {
          source: 'eurodeputes',
          created: r.created,
          updated: r.linked,
          durationMs: 0,
          error: r.errors > 0 ? `${r.errors} erreur(s)` : undefined,
        };
      }),
    );
  }

  printSummary('Ingestion Parlement européen', results, logger);
  return results;
}
