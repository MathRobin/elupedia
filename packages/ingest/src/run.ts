import { type StepResult } from './run-helpers.js';
import { runAn } from './run-an.js';
import { runSenat } from './run-senat.js';

export type { StepResult };

export async function run(enabledSteps?: Set<string>): Promise<StepResult[]> {
  const anResults = await runAn(enabledSteps);
  const senatResults = await runSenat(enabledSteps);
  return [...anResults, ...senatResults];
}
