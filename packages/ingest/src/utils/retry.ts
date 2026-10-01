import { logger } from '../logger.js';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Délai de base utilisé à la place de baseDelayMs quand l'erreur est un 429 (rate limit). */
  rateLimitBaseDelayMs?: number;
  source?: string;
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && /\b429\b/.test(error.message);
}

// drizzle-orm enveloppe les erreurs de requête dans un message générique
// ("Failed query: ... params: ...") et place la vraie raison (ex. le code
// d'erreur Postgres) dans `error.cause`, jamais inclus par défaut — sans ce
// repli, ces logs ne permettent pas de distinguer un blip réseau transitoire
// d'un vrai problème de données (constaté en conditions réelles le
// 01/10/2026, cf. upsert/senators.ts).
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error)
    return `${error.message} (cause: ${cause.message})`;
  if (cause != null) return `${error.message} (cause: ${String(cause)})`;
  return error.message;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    rateLimitBaseDelayMs = 10000,
    source = 'unknown',
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const reason = describeError(error);

      if (attempt === maxAttempts) {
        logger.error(
          `${source}: failed after ${maxAttempts} attempts — ${reason}`,
        );
        throw error;
      }

      const delayBase = isRateLimitError(error)
        ? rateLimitBaseDelayMs
        : baseDelayMs;
      const delay = delayBase * 2 ** (attempt - 1);
      logger.warn(
        `${source}: attempt ${attempt}/${maxAttempts} failed — retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }

  throw new Error('unreachable');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
