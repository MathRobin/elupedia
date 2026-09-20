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
      const reason = error instanceof Error ? error.message : String(error);

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
