import { describe, it, expect, vi } from 'vitest';
import type {
  PlenarySitting,
  RollcallDecision,
} from '../sources/parlement-europeen-votes.js';
import { isSittingFinal } from './europe-votes.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const DRIZZLE_NAME = Symbol.for('drizzle:Name');
function getTableName(table: unknown): string {
  return (table as Record<symbol, string>)[DRIZZLE_NAME] ?? 'unknown';
}

function makeThenable(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return Object.assign(promise, {
    where: () => makeThenable(rows),
    limit: (n: number) => Promise.resolve(rows.slice(0, n)),
  });
}

/**
 * Mock générique : `.from(table)` renvoie toujours le contenu courant de
 * `store[table]`, que l'appel se termine par `.where()`, `.where().limit()`
 * ou directement sans filtre (comme `loadFrenchMepOfficialIds`). Les tests
 * gardent volontairement un seul enregistrement pertinent par table à la
 * fois pour ne pas avoir à interpréter les conditions SQL.
 */
function createMockDb(
  seed: Partial<Record<string, Record<string, unknown>[]>> = {},
) {
  const store: Record<string, Record<string, unknown>[]> = {
    officials: [],
    ballots: [],
    votes: [],
    data_provenance: [],
    ...seed,
  };

  const db = {
    select: () => ({
      from: (table: unknown) => makeThenable(store[getTableName(table)] ?? []),
    }),
    insert: (table: unknown) => {
      const name = getTableName(table);
      return {
        values: (values: Record<string, unknown>) => {
          const row = { id: crypto.randomUUID(), ...values };
          store[name]?.push(row);
          return { returning: () => Promise.resolve([row]) };
        },
      };
    },
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };

  return { db, store };
}

describe('isSittingFinal', () => {
  it('treats a sitting from more than 2 days ago as final', () => {
    const today = new Date('2026-09-18T12:00:00Z');
    expect(isSittingFinal('2026-09-10', today)).toBe(true);
  });

  it('does not treat a very recent sitting as final', () => {
    const today = new Date('2026-09-18T12:00:00Z');
    expect(isSittingFinal('2026-09-17', today)).toBe(false);
    expect(isSittingFinal('2026-09-18', today)).toBe(false);
  });
});

describe('upsertEuropeVotes', () => {
  it('creates ballots and votes only for French MEPs, ignoring other voters', async () => {
    const marieId = 'official-marie';
    const { db, store } = createMockDb({
      officials: [{ id: marieId, europarlId: '97236' }],
    });
    const { upsertEuropeVotes } = await import('./europe-votes.js');

    const sittings: PlenarySitting[] = [
      { id: 'MTG-PL-2026-09-10', date: '2026-09-10' },
    ];
    const decisions: RollcallDecision[] = [
      {
        id: 'MTG-PL-2026-09-10-DEC-1',
        date: '2026-09-10',
        title: 'Vote test',
        votersByPersonId: new Map([
          ['97236', 'for'],
          ['999999', 'against'], // pas un eurodéputé français connu
        ]),
      },
    ];

    const summary = await upsertEuropeVotes(
      db as never,
      sittings,
      async () => decisions,
    );

    expect(summary.ballots).toBe(1);
    expect(summary.votes).toBe(1);
    expect(store.ballots).toHaveLength(1);
    expect(store.ballots[0]).toMatchObject({
      anId: 'europarl-vote-MTG-PL-2026-09-10-DEC-1',
      type: 'europarl',
    });
    expect(store.votes).toHaveLength(1);
    expect(store.votes[0]).toMatchObject({
      officialId: marieId,
      position: 'for',
    });
  });

  it('does not re-create a vote already recorded for an official on that ballot', async () => {
    const marieId = 'official-marie';
    const { db, store } = createMockDb({
      officials: [{ id: marieId, europarlId: '97236' }],
      ballots: [
        { id: 'ballot-1', anId: 'europarl-vote-MTG-PL-2026-09-10-DEC-1' },
      ],
      votes: [
        {
          id: 'vote-1',
          ballotId: 'ballot-1',
          officialId: marieId,
          position: 'for',
        },
      ],
    });
    const { upsertEuropeVotes } = await import('./europe-votes.js');

    const decisions: RollcallDecision[] = [
      {
        id: 'MTG-PL-2026-09-10-DEC-1',
        date: '2026-09-10',
        title: 'Vote test',
        votersByPersonId: new Map([['97236', 'for']]),
      },
    ];

    const summary = await upsertEuropeVotes(
      db as never,
      [{ id: 'MTG-PL-2026-09-10', date: '2026-09-10' }],
      async () => decisions,
    );

    expect(summary.ballots).toBe(0);
    expect(summary.ballotsExisting).toBe(1);
    expect(summary.votes).toBe(0);
    expect(store.votes).toHaveLength(1);
  });

  it('marks a sitting older than 2 days as processed and skips it on the next run', async () => {
    const { db, store } = createMockDb();
    const { upsertEuropeVotes } = await import('./europe-votes.js');
    const oldSitting: PlenarySitting = {
      id: 'MTG-PL-2020-01-01',
      date: '2020-01-01',
    };
    const fetchDecisions = vi.fn().mockResolvedValue([]);

    await upsertEuropeVotes(db as never, [oldSitting], fetchDecisions);
    expect(fetchDecisions).toHaveBeenCalledTimes(1);
    expect(store.data_provenance).toHaveLength(1);

    const summary2 = await upsertEuropeVotes(
      db as never,
      [oldSitting],
      fetchDecisions,
    );
    expect(fetchDecisions).toHaveBeenCalledTimes(1); // pas rappelé
    expect(summary2.sittingsSkipped).toBe(1);
  });

  it('does not skip a recent sitting even if never marked processed', async () => {
    const { db } = createMockDb();
    const { upsertEuropeVotes } = await import('./europe-votes.js');
    const fetchDecisions = vi.fn().mockResolvedValue([]);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const recentSitting: PlenarySitting = {
      id: `MTG-PL-${yesterdayStr}`,
      date: yesterdayStr,
    };

    await upsertEuropeVotes(db as never, [recentSitting], fetchDecisions);
    await upsertEuropeVotes(db as never, [recentSitting], fetchDecisions);

    expect(fetchDecisions).toHaveBeenCalledTimes(2);
  });
});
