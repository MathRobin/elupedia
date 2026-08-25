import { describe, it, expect } from 'vitest';
import { mapPosition, type VoteDetail } from './votes.js';

const DRIZZLE_NAME = Symbol.for('drizzle:Name');

function getTableName(table: unknown): string {
  return (table as Record<symbol, string>)[DRIZZLE_NAME] ?? 'unknown';
}

function createMockDb() {
  const store: Record<string, Record<string, unknown>[]> = {
    ballots: [],
    votes: [],
    data_provenance: [],
  };

  let currentTable = '';

  const db = {
    select: (cols?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        currentTable = getTableName(table);
        return {
          where: (..._args: unknown[]) => ({
            limit: () =>
              Promise.resolve(store[currentTable]?.filter(() => true) ?? []),
          }),
        };
      },
    }),
    insert: (table: unknown) => {
      currentTable = getTableName(table);
      return {
        values: (values: Record<string, unknown>) => {
          const id = crypto.randomUUID();
          const row = { ...values, id };
          store[currentTable]?.push(row);
          return {
            returning: () => Promise.resolve([row]),
          };
        },
      };
    },
    update: (table: unknown) => {
      currentTable = getTableName(table);
      return {
        set: () => ({
          where: () => Promise.resolve(),
        }),
      };
    },
  };

  return { db, store };
}

const mockVote: VoteDetail = {
  scrutin_id: 42,
  scrutin_titre: 'Budget 2025',
  scrutin_date: '2025-01-15',
  scrutin_type: 'ordinaire',
  position: 'pour',
};

describe('upsertVotes provenance', () => {
  it('writes data_provenance for each vote', async () => {
    const { db, store } = createMockDb();
    const { upsertVotes } = await import('./votes.js');

    await upsertVotes(db as never, 'official-uuid-1', [mockVote]);

    expect(store.data_provenance).toHaveLength(1);
    const prov = store.data_provenance[0];
    expect(prov.sourceTable).toBe('votes');
    expect(prov.sourceRecordId).toContain('scrutin-42');
    expect(prov.sourceRecordId).toContain('official-uuid-1');
    expect(prov.sourceName).toBe('Assemblée nationale - Open Data');
    expect(prov.sourceUrl).toContain('42');
    expect(prov.rawData).toEqual(mockVote);
    expect(prov.fetchedAt).toBeInstanceOf(Date);
  });

  it('handles missing scrutin_type', async () => {
    const { db, store } = createMockDb();
    const { upsertVotes } = await import('./votes.js');

    const voteNoType = { ...mockVote, scrutin_type: undefined };
    await upsertVotes(db as never, 'official-uuid-2', [voteNoType]);

    expect(store.data_provenance).toHaveLength(1);
    expect(store.ballots[0].type).toBe('ordinaire');
  });
});

describe('mapPosition', () => {
  it('maps "pour" to "for"', () => {
    expect(mapPosition('pour')).toBe('for');
  });

  it('maps "contre" to "against"', () => {
    expect(mapPosition('contre')).toBe('against');
  });

  it('maps "abstention" to "abstain"', () => {
    expect(mapPosition('abstention')).toBe('abstain');
  });

  it('maps "absent" to "absent"', () => {
    expect(mapPosition('absent')).toBe('absent');
  });

  it('maps "non-votant" to "absent"', () => {
    expect(mapPosition('non-votant')).toBe('absent');
  });

  it('maps unknown positions to "absent"', () => {
    expect(mapPosition('inconnu')).toBe('absent');
  });

  it('is case-insensitive', () => {
    expect(mapPosition('Pour')).toBe('for');
    expect(mapPosition('CONTRE')).toBe('against');
  });
});
