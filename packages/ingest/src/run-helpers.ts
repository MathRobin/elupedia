/**
 * Briques communes aux orchestrateurs `run-*.ts` : le type StepResult (bilan
 * d'une étape), runStep() qui isole une étape, et printSummary() qui affiche
 * le bilan d'un run.
 *
 * Invariant du package : une étape qui échoue ne doit jamais faire tomber le
 * run — runStep attrape l'erreur et la range dans `StepResult.error`, le
 * main décide ensuite du code de sortie (ou pas) à partir des résultats.
 */
import { withRetry } from './utils/retry.js';

/**
 * Bilan d'une étape d'ingestion. `created` / `updated` sont des compteurs
 * « libres » : chaque étape y range ce qui a du sens pour elle (ex. fiches
 * créées / mandats touchés, ou envoyés / ignorés) — voir le run-*.ts
 * concerné. Ils alimentent utils/change-detector.ts (rebuild si > 0).
 */
export interface StepResult {
  source: string;
  created: number;
  updated: number;
  durationMs: number;
  error?: string;
}

/** Durée lisible pour les logs : « 850ms », « 12.3s », « 4min 5s ». */
export function humanDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return remainingSeconds > 0
    ? `${minutes}min ${remainingSeconds}s`
    : `${minutes}min`;
}

/**
 * Exécute une étape en la protégeant : l'ensemble de `fn` (fetch + upsert)
 * est rejoué par withRetry (3 tentatives par défaut), puis toute erreur
 * résiduelle est convertie en StepResult avec `error` plutôt que propagée.
 *
 * Conséquence : `fn` peut être exécutée plusieurs fois — ses écritures en
 * base doivent être idempotentes (upserts). `durationMs` renvoyé par `fn`
 * est ignoré et remplacé par la durée mesurée ici.
 */
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
    const message = error instanceof Error ? error.message : String(error);
    return {
      source,
      created: 0,
      updated: 0,
      durationMs: Math.round(performance.now() - start),
      error: message,
    };
  }
}

/** Affiche le bilan d'un run (une ligne par étape + total), via `logger`. */
export function printSummary(
  label: string,
  results: StepResult[],
  logger: { info: (msg: string) => void },
): void {
  logger.info(`\n=== ${label} summary ===`);
  const errors = results.filter((result) => result.error);
  for (const result of results) {
    const status = result.error ? `ERROR: ${result.error}` : 'OK';
    logger.info(
      `  ${result.source}: ${result.created} created, ${result.updated} updated — ${status} (${humanDuration(result.durationMs)})`,
    );
  }
  const totalMs = results.reduce((sum, result) => sum + result.durationMs, 0);
  logger.info(
    `\nTotal: ${results.length} sources, ${errors.length} error(s), ${humanDuration(totalMs)}`,
  );
}
