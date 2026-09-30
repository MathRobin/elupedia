import { describe, it, expect, vi } from 'vitest';
import type { SenateurActivity } from '../sources/senat-activite.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

const DRIZZLE_NAME = Symbol.for('drizzle:Name');
function getTableName(table: unknown): string {
  return (table as Record<symbol, string>)[DRIZZLE_NAME] ?? 'unknown';
}

function makeThenable(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return Object.assign(promise, {
    where: () => makeThenable(rows),
  });
}

/**
 * Mock DB minimal. `failParliamentaryActivitySelects` simule un nombre
 * d'échecs (successifs, sur chaque tentative de withRetry comprise) du
 * select `parliamentary_activity` avant de laisser passer — pour tester la
 * résilience à un blip réseau isolé (driver Neon HTTP, cf. commentaire en
 * tête de senat-parliamentary-activity.ts).
 */
function createMockDb(
  seed: Partial<Record<string, Record<string, unknown>[]>> = {},
  failParliamentaryActivitySelects = 0,
) {
  const store: Record<string, Record<string, unknown>[]> = {
    officials: [],
    parliamentary_activity: [],
    ...seed,
  };
  let remainingFailures = failParliamentaryActivitySelects;
  let parliamentaryActivitySelectCount = 0;

  const db = {
    select: () => ({
      from: (table: unknown) => {
        const name = getTableName(table);
        if (name === 'parliamentary_activity') {
          parliamentaryActivitySelectCount++;
          if (remainingFailures > 0) {
            remainingFailures--;
            return {
              where: () =>
                Promise.reject(new Error('fetch failed (blip réseau)')),
            };
          }
        }
        return makeThenable(store[name] ?? []);
      },
    }),
    insert: (table: unknown) => {
      const name = getTableName(table);
      return {
        values: (rows: Record<string, unknown>[]) => {
          for (const row of rows) {
            store[name]?.push({ id: crypto.randomUUID(), ...row });
          }
          return Promise.resolve();
        },
      };
    },
    update: () => ({
      set: () => ({ where: () => Promise.resolve() }),
    }),
  };

  return {
    db,
    store,
    getParliamentaryActivitySelectCount: () => parliamentaryActivitySelectCount,
  };
}

function senateurActivity(
  matricule: string,
  overrides: Partial<SenateurActivity['activities'][number]> = {},
): SenateurActivity {
  return {
    matricule,
    activities: [
      {
        type: 'written_question',
        title: `Question de ${matricule}`,
        date: '2025-01-10',
        sourceUrl: `https://www.senat.fr/questions/base/${matricule}.html`,
        ...overrides,
      },
    ],
  };
}

describe('upsertSenatParliamentaryActivity', () => {
  it('creates activity rows for matched sénateurs', async () => {
    const { db, store } = createMockDb({
      officials: [{ id: 'official-1', senatId: '12345A' }],
    });

    const { upsertSenatParliamentaryActivity } =
      await import('./senat-parliamentary-activity.js');
    const summary = await upsertSenatParliamentaryActivity(db as never, [
      senateurActivity('12345A'),
    ]);

    expect(summary).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(store.parliamentary_activity).toHaveLength(1);
  });

  it('skips a sénateur with no matching official instead of failing', async () => {
    const { db } = createMockDb({ officials: [] });

    const { upsertSenatParliamentaryActivity } =
      await import('./senat-parliamentary-activity.js');
    const summary = await upsertSenatParliamentaryActivity(db as never, [
      senateurActivity('unknown'),
    ]);

    expect(summary).toEqual({ created: 0, updated: 0, skipped: 1 });
  });

  it('retries an isolated transient failure and still processes the sénateur (incident du 30/09/2026)', async () => {
    const { db, store } = createMockDb(
      { officials: [{ id: 'official-1', senatId: '12345A' }] },
      1, // échoue une seule fois : absorbé par le retry
    );

    const { upsertSenatParliamentaryActivity } =
      await import('./senat-parliamentary-activity.js');
    const summary = await upsertSenatParliamentaryActivity(db as never, [
      senateurActivity('12345A'),
    ]);

    expect(summary).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(store.parliamentary_activity).toHaveLength(1);
  });

  it('stops cleanly (without throwing) after too many consecutive failures, keeping progress already made', async () => {
    const officials = Array.from({ length: 7 }, (_, i) => ({
      id: `official-${i}`,
      senatId: `${i}A`,
    }));
    // Échoue en continu : chaque tentative (les 2 essais du retry par
    // sénateur compris) échoue, donc jamais absorbée — simule une panne
    // systémique plutôt qu'un blip isolé.
    const { db, store, getParliamentaryActivitySelectCount } = createMockDb(
      { officials },
      Infinity,
    );

    const { upsertSenatParliamentaryActivity } =
      await import('./senat-parliamentary-activity.js');
    const activities = officials.map((o) => senateurActivity(o.senatId));

    // Ne doit jamais lever : run-senat.ts rejoue toute la fonction sur une
    // exception (withRetry de run-helpers.ts), ce qui repartirait du premier
    // sénateur au lieu de s'arrêter proprement (cf. commentaire en tête de
    // fichier source).
    const summary = await upsertSenatParliamentaryActivity(
      db as never,
      activities,
    );

    expect(summary.created).toBe(0);
    expect(store.parliamentary_activity).toHaveLength(0);
    // 5 sénateurs tentés (seuil MAX_CONSECUTIVE_FAILURES) × 2 essais chacun
    // (withRetry) = 10, jamais les 7 × 2 = 14 qu'un parcours complet ferait.
    expect(getParliamentaryActivitySelectCount()).toBeLessThanOrEqual(10);
  });
});
