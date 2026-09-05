import { createDb } from '@elupedia/shared';
import { type StepResult, runStep } from './run-helpers.js';
import { runAn } from './run-an.js';
import { runSenat } from './run-senat.js';
import { runMaires } from './run-maires.js';
import { runInterests } from './run-interests.js';
import { geocodeAllAddresses } from './upsert/geocode-addresses.js';
import { uploadMaps } from './upsert/upload-maps.js';
import { uploadPhotos } from './upsert/upload-photos.js';
import { fetchCnccfpAccounts, CNCCFP_ELECTIONS } from './sources/cnccfp.js';
import { upsertCampaignAccounts } from './upsert/campaign-accounts.js';
import { logger } from './logger.js';

export type { StepResult };

export async function run(enabledSteps?: Set<string>): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const anResults = await runAn(enabledSteps);
  const senatResults = await runSenat(enabledSteps);
  const mairesResults = await runMaires(enabledSteps);

  const interestsResults: StepResult[] = [];
  if (enabled('interests')) {
    const r = await runInterests();
    interestsResults.push(...r);
  }

  const geocodeResults: StepResult[] = [];
  if (enabled('geocode')) {
    logger.info('[Geocoding] Geocoding addresses...');
    const db = createDb();
    geocodeResults.push(
      await runStep('geocode', async () => {
        const r = await geocodeAllAddresses(db);
        return {
          source: 'geocode',
          created: r.geocoded,
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
        const r = await uploadMaps(mapsDb);
        return {
          source: 'maps',
          created: r.uploaded,
          updated: r.skipped,
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
          const r = await upsertCampaignAccounts(campaignDb, rows, election);
          totalCreated += r.created;
          totalUpdated += r.updated;
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
        const r = await uploadPhotos(photosDb);
        return {
          source: 'photos',
          created: r.uploaded,
          updated: r.skipped,
          durationMs: 0,
        };
      }),
    );
  }

  return [
    ...anResults,
    ...senatResults,
    ...mairesResults,
    ...interestsResults,
    ...geocodeResults,
    ...mapsResults,
    ...campaignResults,
    ...photosResults,
  ];
}
