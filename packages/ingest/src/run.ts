/**
 * Orchestrateur du run complet (`yarn --cwd packages/ingest ingest`) : enchaîne
 * les sous-orchestrateurs par domaine (AN, Sénat, maires, conseillers…) puis
 * les étapes transverses (intérêts HATVP, géocodage, cartes, comptes de
 * campagne, photos, statuts HATVP), et concatène tous les StepResult.
 *
 * Convention du package : les `run-*.ts` portent la logique testable (pas
 * d'arguments, pas de process.exit) et sont lancés par le `main-*.ts` du
 * même nom. Ici, lancé par main.ts ; chaque sous-run ouvre sa propre
 * connexion DB via createDb().
 *
 * Ordre important : les sous-runs créent les fiches `officials` dont
 * dépendent les étapes transverses (intérêts, géocodage des adresses…).
 * Pièges : `photos` et `hatvp-status` ne figurent pas dans STEP_NAMES
 * (cli.ts), ils ne tournent donc qu'en l'absence de --only/--skip ; les
 * sous-runs reçoivent `enabledSteps` tel quel et filtrent eux-mêmes.
 */
import { createDb } from '@elupedia/shared';
import { type StepResult, runStep } from './run-helpers.js';
import { runAn } from './run-an.js';
import { runSenat } from './run-senat.js';
import { runMaires } from './run-maires.js';
import { runConseillersDep } from './run-conseillers-dep.js';
import { runConseillersReg } from './run-conseillers-reg.js';
import { runConseillersArr } from './run-conseillers-arr.js';
import { runMembresAssemblee } from './run-membres-assemblee.js';
import { runInterests } from './run-interests.js';
import { geocodeAllAddresses } from './upsert/geocode-addresses.js';
import { uploadMaps } from './upsert/upload-maps.js';
import { uploadPhotos } from './upsert/upload-photos.js';
import { upsertHatvpStatuses } from './upsert/hatvp-status.js';
import { fetchCnccfpAccounts, CNCCFP_ELECTIONS } from './sources/cnccfp.js';
import { upsertCampaignAccounts } from './upsert/campaign-accounts.js';
import { logger } from './logger.js';

export type { StepResult };

/**
 * Lance tout le pipeline. `enabledSteps` absent = toutes les étapes ;
 * sinon seules les étapes nommées tournent (voir cli.ts). Écrit en base.
 */
export async function run(enabledSteps?: Set<string>): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const anResults = await runAn(enabledSteps);
  const senatResults = await runSenat(enabledSteps);
  const mairesResults = await runMaires(enabledSteps);
  const conseillersDepResults = await runConseillersDep(enabledSteps);
  const conseillersRegResults = await runConseillersReg(enabledSteps);
  const conseillersArrResults = await runConseillersArr(enabledSteps);
  const membresAssembleeResults = await runMembresAssemblee(enabledSteps);

  const interestsResults: StepResult[] = [];
  if (enabled('interests')) {
    interestsResults.push(...(await runInterests()));
  }

  const geocodeResults: StepResult[] = [];
  if (enabled('geocode')) {
    logger.info('[Geocoding] Geocoding addresses...');
    const db = createDb();
    geocodeResults.push(
      await runStep('geocode', async () => {
        const geocoding = await geocodeAllAddresses(db);
        return {
          source: 'geocode',
          created: geocoding.geocoded,
          updated: 0,
          durationMs: 0,
        };
      }),
    );
  }

  const mapsResults: StepResult[] = [];
  if (enabled('maps')) {
    logger.info('[Maps] Generating and uploading static maps...');
    const mapsDb = createDb();
    mapsResults.push(
      await runStep('maps', async () => {
        const upload = await uploadMaps(mapsDb);
        // Pas de colonne « ignorées » dans StepResult : on recycle `updated`.
        return {
          source: 'maps',
          created: upload.uploaded,
          updated: upload.skipped,
          durationMs: 0,
        };
      }),
    );
  }

  const campaignResults: StepResult[] = [];
  if (enabled('campaign-accounts')) {
    logger.info('[CNCCFP] Fetching and upserting campaign accounts...');
    const campaignDb = createDb();
    campaignResults.push(
      await runStep('campaign-accounts', async () => {
        let totalCreated = 0;
        let totalUpdated = 0;
        for (const election of CNCCFP_ELECTIONS) {
          const rows = await fetchCnccfpAccounts(election);
          const upsert = await upsertCampaignAccounts(
            campaignDb,
            rows,
            election,
          );
          totalCreated += upsert.created;
          totalUpdated += upsert.updated;
        }
        return {
          source: 'campaign-accounts',
          created: totalCreated,
          updated: totalUpdated,
          durationMs: 0,
        };
      }),
    );
  }

  const photosResults: StepResult[] = [];
  if (enabled('photos')) {
    logger.info('[Photos] Uploading official photos to S3...');
    const photosDb = createDb();
    photosResults.push(
      await runStep('photos', async () => {
        const upload = await uploadPhotos(photosDb);
        return {
          source: 'photos',
          created: upload.uploaded,
          updated: upload.skipped,
          durationMs: 0,
        };
      }),
    );
  }

  const hatvpStatusResults: StepResult[] = [];
  if (enabled('hatvp-status')) {
    logger.info('[HATVP] Checking declaration statuses...');
    const hatvpDb = createDb();
    hatvpStatusResults.push(
      await runStep('hatvp-status', async () => {
        const statuses = await upsertHatvpStatuses(hatvpDb);
        // created = déclarations en attente, updated = statuts vérifiés.
        return {
          source: 'hatvp-status',
          created: statuses.pending,
          updated: statuses.checked,
          durationMs: 0,
        };
      }),
    );
  }

  return [
    ...anResults,
    ...senatResults,
    ...mairesResults,
    ...conseillersDepResults,
    ...conseillersRegResults,
    ...conseillersArrResults,
    ...membresAssembleeResults,
    ...interestsResults,
    ...geocodeResults,
    ...mapsResults,
    ...campaignResults,
    ...photosResults,
    ...hatvpStatusResults,
  ];
}
