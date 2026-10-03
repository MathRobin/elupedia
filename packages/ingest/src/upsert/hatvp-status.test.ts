import { describe, it, expect, vi } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Évite de fabriquer un vrai ZIP pour le test : fetchCommunesOver20k lit le
// contenu via unzipper, qu'on mocke pour renvoyer directement un CSV
// minimal plutôt que des octets ZIP réels.
vi.mock('unzipper', () => ({
  default: {
    Open: {
      buffer: async () => ({
        files: [
          {
            path: 'donnees_communes.csv',
            buffer: async () =>
              Buffer.from('header\n;;;;;;75056;;20000\n', 'utf-8'),
          },
        ],
      }),
    },
  },
}));

vi.mock('../utils/retry.js', async () => {
  const actual =
    await vi.importActual<typeof import('../utils/retry.js')>(
      '../utils/retry.js',
    );
  return {
    ...actual,
    withRetry: (fn: () => Promise<unknown>, options: Record<string, unknown>) =>
      actual.withRetry(fn, { ...options, baseDelayMs: 0 }),
  };
});

const inseeFetch = () =>
  Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  }) as unknown as Promise<Response>;

/**
 * Mock DB minimal ciblant la requête `selectDistinct(interests)` : le
 * paramètre `failTimes` fait échouer cette requête ce nombre de fois avant
 * de laisser passer (ou indéfiniment avec Infinity, pour simuler une panne
 * persistante). Les autres requêtes (parlementaires/maires/cleanup)
 * renvoient toujours des résultats vides pour garder le test ciblé sur la
 * résilience plutôt que sur la logique métier, déjà couverte ailleurs.
 */
function createMockDb(failTimes = 0) {
  let remaining = failTimes;
  let selectDistinctCalls = 0;

  const db = {
    selectDistinct: () => ({
      from: () => {
        selectDistinctCalls++;
        if (remaining > 0) {
          remaining--;
          return Promise.reject(new Error('fetch failed (blip réseau)'));
        }
        return Promise.resolve([]);
      },
    }),
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => Promise.resolve([]) }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };

  return { db, getSelectDistinctCalls: () => selectDistinctCalls };
}

describe('upsertHatvpStatuses — résilience aux blips réseau (incident du 02/10/2026)', () => {
  it('retries an isolated transient failure on the upfront interests query and still completes', async () => {
    const { db, getSelectDistinctCalls } = createMockDb(1); // échoue une seule fois : absorbé par le retry

    const { upsertHatvpStatuses } = await import('./hatvp-status.js');
    const summary = await upsertHatvpStatuses(db as never, inseeFetch as never);

    expect(summary).toEqual({ checked: 0, pending: 0, skipped: 0 });
    expect(getSelectDistinctCalls()).toBe(2);
  });

  it('still propagates after exhausting retries on a persistent failure, instead of silently continuing with wrong data', async () => {
    const { db } = createMockDb(Infinity); // échoue en continu : panne persistante, pas un blip isolé

    const { upsertHatvpStatuses } = await import('./hatvp-status.js');

    await expect(
      upsertHatvpStatuses(db as never, inseeFetch as never),
    ).rejects.toThrow('fetch failed (blip réseau)');
  });
});
