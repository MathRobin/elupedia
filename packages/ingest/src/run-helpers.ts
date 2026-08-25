import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { withRetry } from './utils/retry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '../../../.env') });

export interface StepResult {
  source: string;
  created: number;
  updated: number;
  durationMs: number;
  error?: string;
}

export function humanDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return rem > 0 ? `${m}min ${rem}s` : `${m}min`;
}

export async function runStep(
  source: string,
  fn: () => Promise<StepResult>,
): Promise<StepResult> {
  const start = performance.now();
  try {
    const result = await withRetry(fn, { source });
    result.durationMs = Math.round(performance.now() - start);
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      source,
      created: 0,
      updated: 0,
      durationMs: Math.round(performance.now() - start),
      error: msg,
    };
  }
}

export function printSummary(
  label: string,
  results: StepResult[],
  logger: { info: (msg: string) => void },
): void {
  logger.info(`\n=== ${label} summary ===`);
  const errors = results.filter((r) => r.error);
  for (const r of results) {
    const status = r.error ? `ERROR: ${r.error}` : 'OK';
    logger.info(
      `  ${r.source}: ${r.created} created, ${r.updated} updated — ${status} (${humanDuration(r.durationMs)})`,
    );
  }
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  logger.info(
    `\nTotal: ${results.length} sources, ${errors.length} error(s), ${humanDuration(totalMs)}`,
  );
}
