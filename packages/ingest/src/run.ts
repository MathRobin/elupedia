import { createDb } from '@elupedia/shared';
import { type StepResult, runStep } from './run-helpers.js';
import { runAn } from './run-an.js';
import { runSenat } from './run-senat.js';
import { runMaires } from './run-maires.js';
import { geocodeAllAddresses } from './upsert/geocode-addresses.js';
import { logger } from './logger.js';

export type { StepResult };

export async function run(enabledSteps?: Set<string>): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const anResults = await runAn(enabledSteps);
  const senatResults = await runSenat(enabledSteps);
  const mairesResults = await runMaires(enabledSteps);

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

  return [...anResults, ...senatResults, ...mairesResults, ...geocodeResults];
}
