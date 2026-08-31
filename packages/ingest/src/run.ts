import { type StepResult } from './run-helpers.js';
import { runAn } from './run-an.js';
import { runSenat } from './run-senat.js';
import { runMaires } from './run-maires.js';

export type { StepResult };

export async function run(enabledSteps?: Set<string>): Promise<StepResult[]> {
  const anResults = await runAn(enabledSteps);
  const senatResults = await runSenat(enabledSteps);
  const mairesResults = await runMaires(enabledSteps);
  return [...anResults, ...senatResults, ...mairesResults];
}
