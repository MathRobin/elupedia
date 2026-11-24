/**
 * Tests d'upsertEuropePresence et upsertSittingAttendance : filtrage des
 * signataires français, séance sans liste, marquage des séances définitives,
 * séance sans fiche (404). Base simulée, aucun appel réseau.
 */
import { describe, it, expect, vi } from 'vitest';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { PlenarySitting } from '../sources/parlement-europeen-votes.js';
import type { SittingAttendance } from '../sources/parlement-europeen-presence.js';
import {
  upsertEuropePresence,
  upsertSittingAttendance,
} from './europe-presence.js';

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
 * Mock générique : `.from(table)` renvoie le contenu courant de
 * `store[table]`. `insert().values()` accepte une ligne ou un tableau et
 * ignore `onConflictDoUpdate` (l'unicité est garantie par l'index en base,
 * pas par ce mock).
 */
function createMockDb(
  seed: Partial<Record<string, Record<string, unknown>[]>> = {},
) {
  const store: Record<string, Record<string, unknown>[]> = {
    europarl_attendance: [],
    data_provenance: [],
    ...seed,
  };

  const db = {
    select: () => ({
      from: (table: unknown) => makeThenable(store[getTableName(table)] ?? []),
    }),
    insert: (table: unknown) => {
      const name = getTableName(table);
      const push = (
        values: Record<string, unknown> | Record<string, unknown>[],
      ) => {
        for (const value of Array.isArray(values) ? values : [values]) {
          store[name]?.push({ id: crypto.randomUUID(), ...value });
        }
      };
      return {
        values: (
          values: Record<string, unknown> | Record<string, unknown>[],
        ) => {
          push(values);
          return {
            onConflictDoUpdate: () => Promise.resolve(),
            returning: () => Promise.resolve(store[name]!.slice(-1)),
          };
        },
      };
    },
  };

  return { db: db as unknown as NeonHttpDatabase, store };
}

const SIGNED_SITTING: SittingAttendance = {
  sittingId: 'MTG-PL-2024-10-21',
  date: '2024-10-21',
  // 900001 et 900003 sont français en base, 900002 ne l'est pas.
  signedPersonIds: ['900001', '900002', '900003'],
  excusedPersonIds: ['900004'],
  attendeeCount: 3,
  attendanceListUrl:
    'https://data.europarl.europa.eu/distribution/doc/PV-10-2024-10-21-ATT_fr.pdf',
};

const FRENCH_MEPS = new Map([
  ['900001', 'official-1'],
  ['900003', 'official-3'],
]);

describe('upsertSittingAttendance', () => {
  it('writes only the French signatories', async () => {
    const { db, store } = createMockDb();

    const result = await upsertSittingAttendance(
      db,
      SIGNED_SITTING,
      FRENCH_MEPS,
    );

    expect(result).toEqual({ frenchSigners: 2, unknownSigners: 1 });
    expect(store.europarl_attendance).toHaveLength(2);
    expect(store.europarl_attendance.map((r) => r.officialId)).toEqual([
      'official-1',
      'official-3',
    ]);
    expect(store.europarl_attendance[0]).toMatchObject({
      sittingDate: '2024-10-21',
      pvUrl: SIGNED_SITTING.attendanceListUrl,
    });
  });

  it('deduplicates a signatory listed twice by the source', async () => {
    const { db, store } = createMockDb();
    const result = await upsertSittingAttendance(
      db,
      { ...SIGNED_SITTING, signedPersonIds: ['900001', '900001'] },
      FRENCH_MEPS,
    );
    expect(result).toEqual({ frenchSigners: 1, unknownSigners: 0 });
    expect(store.europarl_attendance).toHaveLength(1);
  });

  it('writes nothing when no French MEP signed', async () => {
    const { db, store } = createMockDb();
    const result = await upsertSittingAttendance(
      db,
      { ...SIGNED_SITTING, signedPersonIds: ['900002'] },
      FRENCH_MEPS,
    );
    expect(result).toEqual({ frenchSigners: 0, unknownSigners: 1 });
    expect(store.europarl_attendance).toHaveLength(0);
  });
});

describe('upsertEuropePresence', () => {
  const sittings: PlenarySitting[] = [
    { id: 'MTG-PL-2024-10-21', date: '2024-10-21' },
  ];

  it('writes the signatures and marks a final sitting', async () => {
    const { db, store } = createMockDb();
    const fetchAttendance = vi.fn().mockResolvedValue(SIGNED_SITTING);

    const summary = await upsertEuropePresence(
      db,
      sittings,
      fetchAttendance,
      FRENCH_MEPS,
    );

    expect(summary).toEqual({
      sittingsSkipped: 0,
      sittingsProcessed: 1,
      sittingsWithoutList: 0,
      signatures: 2,
    });
    expect(store.europarl_attendance).toHaveLength(2);
    expect(store.data_provenance).toHaveLength(1);
    expect(store.data_provenance[0]).toMatchObject({
      sourceTable: 'europarl_attendance',
      sourceRecordId: 'MTG-PL-2024-10-21',
      sourceUrl: SIGNED_SITTING.attendanceListUrl,
    });
  });

  it('skips a final sitting already marked, without a network call', async () => {
    const { db } = createMockDb({
      data_provenance: [
        {
          sourceTable: 'europarl_attendance',
          sourceRecordId: 'MTG-PL-2024-10-21',
        },
      ],
    });
    const fetchAttendance = vi.fn();

    const summary = await upsertEuropePresence(
      db,
      sittings,
      fetchAttendance,
      FRENCH_MEPS,
    );

    expect(fetchAttendance).not.toHaveBeenCalled();
    expect(summary.sittingsSkipped).toBe(1);
    expect(summary.signatures).toBe(0);
  });

  it('does not mark a sitting whose list is not published yet', async () => {
    const { db, store } = createMockDb();
    const fetchAttendance = vi
      .fn()
      .mockResolvedValue({ ...SIGNED_SITTING, signedPersonIds: [] });

    const summary = await upsertEuropePresence(
      db,
      sittings,
      fetchAttendance,
      FRENCH_MEPS,
    );

    expect(summary.sittingsWithoutList).toBe(1);
    expect(store.europarl_attendance).toHaveLength(0);
    expect(store.data_provenance).toHaveLength(0);
  });

  it('ignores a sitting without a record (404)', async () => {
    const { db, store } = createMockDb();
    const fetchAttendance = vi.fn().mockResolvedValue(null);

    const summary = await upsertEuropePresence(
      db,
      sittings,
      fetchAttendance,
      FRENCH_MEPS,
    );

    expect(summary).toEqual({
      sittingsSkipped: 0,
      sittingsProcessed: 0,
      sittingsWithoutList: 0,
      signatures: 0,
    });
    expect(store.data_provenance).toHaveLength(0);
  });
});
