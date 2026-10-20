import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RneConseillerEpci } from '../sources/rne-conseillers-epci.js';
import { upsertConseillersEpci, officialKey } from './conseillers-epci.js';
import { loadCheckpoint, saveCheckpoint } from '../utils/checkpoint.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../utils/checkpoint.js', () => ({
  loadCheckpoint: vi.fn(() => null),
  saveCheckpoint: vi.fn(),
  clearCheckpoint: vi.fn(),
}));

const DRIZZLE_NAME = Symbol.for('drizzle:Name');
const tableName = (t: unknown): string =>
  (t as Record<symbol, string>)[DRIZZLE_NAME] ?? 'unknown';

type Row = Record<string, unknown>;

/**
 * Base en mémoire : les `select` renvoient le contenu préparé des tables
 * (le filtrage SQL n'est pas simulé : seuls les mandats actifs y figurent),
 * les écritures sont enregistrées pour être vérifiées.
 */
function createDb(
  initial: { officials?: Row[]; active?: Row[]; aliases?: Row[] } = {},
) {
  const store: Record<string, Row[]> = {
    officials: initial.officials ?? [],
    mandates: initial.active ?? [],
    official_aliases: initial.aliases ?? [],
  };
  const calls = {
    officialInserts: [] as Row[][],
    mandateInserts: [] as Row[][],
    updates: [] as { table: string; set: Row }[],
    batches: 0,
    conflictIds: new Set<string>(),
  };
  let n = 0;
  const nextId = () => `id-${++n}`;

  const insertBuilder = (table: string, values: Row | Row[]) => {
    const list = Array.isArray(values) ? values : [values];
    const build = (onConflictSkip: boolean) => ({
      __kind: 'insert' as const,
      returning: () => {
        if (table === 'officials') calls.officialInserts.push(list);
        else calls.mandateInserts.push(list);
        const seen = new Set<string>();
        const rows = list
          .filter((v) => {
            const key = `${v.officialId}|${v.startDate}`;
            if (table === 'mandates' && onConflictSkip) {
              if (calls.conflictIds.has(key) || seen.has(key)) return false;
              seen.add(key);
            }
            return true;
          })
          .map((v) => ({ id: nextId(), ...v }));
        return Promise.resolve(rows);
      },
    });
    return {
      ...build(false),
      onConflictDoNothing: () => build(true),
    };
  };

  const db = {
    select: () => ({
      from: (t: unknown) => {
        const name = tableName(t);
        const rows = store[name] ?? [];
        return Object.assign(Promise.resolve(rows), {
          where: () => Promise.resolve(rows),
        });
      },
    }),
    insert: (t: unknown) => ({
      values: (v: Row | Row[]) => insertBuilder(tableName(t), v),
    }),
    update: (t: unknown) => ({
      set: (set: Row) => ({
        where: () => {
          calls.updates.push({ table: tableName(t), set });
          return { __kind: 'update' as const };
        },
      }),
    }),
    // `insert().returning()` est déjà une promesse de lignes ; `update` est un
    // simple marqueur sans résultat.
    batch: async (builders: unknown[]) => {
      calls.batches++;
      return Promise.all(
        builders.map((b) =>
          (b as { __kind?: string }).__kind === 'update'
            ? Promise.resolve([])
            : Promise.resolve(b),
        ),
      );
    },
  };
  return { db: db as never, calls, store };
}

function row(over: Partial<RneConseillerEpci> = {}): RneConseillerEpci {
  return {
    departmentCode: '01',
    departmentName: 'Ain',
    epciSiren: '200029999',
    epciName: "Cc Rives De L'Ain",
    communeCode: '01056',
    communeName: 'Boyeux',
    lastName: 'TURPIN',
    firstName: 'Juvénal',
    gender: 'M',
    birthDate: '1973-12-23',
    mandateStartDate: '2026-03-15',
    functionLabel: '',
    functionStartDate: '',
    ...over,
  };
}

const existingOfficial = (over: Row = {}): Row => ({
  id: 'off-1',
  firstName: 'Juvénal',
  lastName: 'Turpin',
  birthDate: '1973-12-23',
  slug: 'juvenal-turpin',
  ...over,
});

const activeMandate = (over: Row = {}): Row => ({
  id: 'm-1',
  officialId: 'off-1',
  district: "Cc Rives De L'Ain",
  department: 'Ain',
  communeCode: '01056',
  startDate: '2026-03-15',
  ...over,
});

beforeEach(() => {
  vi.mocked(loadCheckpoint).mockReturnValue(null);
  vi.mocked(saveCheckpoint).mockClear();
});

describe('upsertConseillersEpci', () => {
  it('creates officials in one multi-row insert and their mandates in another', async () => {
    const { db, calls } = createDb();
    const r = await upsertConseillersEpci(db, [
      row(),
      row({
        firstName: 'Eric',
        lastName: 'CASAMASSA',
        birthDate: '1969-08-24',
      }),
    ]);
    expect(calls.officialInserts).toHaveLength(1);
    expect(calls.officialInserts[0]).toHaveLength(2);
    // Lignes triées par clé : CASAMASSA avant TURPIN.
    expect(calls.officialInserts[0].map((o) => o.slug)).toEqual([
      'eric-casamassa',
      'juvenal-turpin',
    ]);
    expect(calls.mandateInserts).toHaveLength(1);
    expect(calls.mandateInserts[0][0]).toMatchObject({
      type: 'conseiller_communautaire',
      district: "Cc Rives De L'Ain",
      department: 'Ain',
      communeCode: '01056',
      startDate: '2026-03-15',
    });
    expect(r).toMatchObject({ officials: 2, mandates: 2, skipped: 0 });
  });

  it('attaches a second mandate to an existing official instead of recreating them', async () => {
    const { db, calls } = createDb({ officials: [existingOfficial()] });
    const r = await upsertConseillersEpci(db, [row()]);
    expect(calls.officialInserts).toHaveLength(0);
    expect(calls.mandateInserts[0][0]).toMatchObject({ officialId: 'off-1' });
    expect(r).toMatchObject({ officials: 0, mandates: 1 });
  });

  it('matches regardless of name casing (RNE capitalises last names)', () => {
    expect(officialKey('Juvénal', 'TURPIN', '1973-12-23')).toBe(
      officialKey('juvénal', 'turpin', '1973-12-23'),
    );
  });

  it('dates the mandate from the seat, not from the function', async () => {
    const { db, calls } = createDb();
    await upsertConseillersEpci(db, [
      row({
        functionLabel: '5eme Vice-président du conseil communautaire',
        functionStartDate: '2026-03-22',
      }),
    ]);
    expect(calls.mandateInserts[0][0]).toMatchObject({
      startDate: '2026-03-15',
    });
  });

  it('leaves an unchanged active mandate untouched', async () => {
    const { db, calls } = createDb({
      officials: [existingOfficial()],
      active: [activeMandate()],
    });
    const r = await upsertConseillersEpci(db, [row()]);
    expect(calls.mandateInserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
    expect(r).toMatchObject({ mandates: 0, updated: 0, ended: 0 });
  });

  it('historizes when the start date is later (close old, open new, one batch)', async () => {
    const { db, calls } = createDb({
      officials: [existingOfficial()],
      active: [activeMandate({ startDate: '2020-07-10' })],
    });
    const r = await upsertConseillersEpci(db, [row()]);
    expect(calls.batches).toBe(1);
    expect(calls.updates[0].set).toMatchObject({ endDate: '2026-03-15' });
    expect(r).toMatchObject({ reelected: 1, mandates: 1 });
  });

  it('corrects an earlier start date in place without historizing', async () => {
    const { db, calls } = createDb({
      officials: [existingOfficial()],
      active: [activeMandate({ startDate: '2026-03-20' })],
    });
    const r = await upsertConseillersEpci(db, [row()]);
    expect(calls.batches).toBe(0);
    expect(calls.updates[0].set).toMatchObject({ startDate: '2026-03-15' });
    expect(r).toMatchObject({ updated: 1, reelected: 0 });
  });

  it('closes active mandates whose holder left the EPCI', async () => {
    const { db, calls } = createDb({
      officials: [
        existingOfficial(),
        existingOfficial({
          id: 'off-2',
          firstName: 'Autre',
          lastName: 'Parti',
          birthDate: '1960-01-01',
          slug: 'autre-parti',
        }),
      ],
      active: [
        activeMandate(),
        activeMandate({ id: 'm-2', officialId: 'off-2' }),
      ],
    });
    const r = await upsertConseillersEpci(db, [row()]);
    expect(r.ended).toBe(1);
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].set).toHaveProperty('endDate');
  });

  it('skips a person listed twice with the same start date in one batch', async () => {
    const { db, calls } = createDb({ officials: [existingOfficial()] });
    const r = await upsertConseillersEpci(db, [
      row(),
      row({
        epciSiren: '200030000',
        epciName: 'Ca Autre',
        communeCode: '01099',
      }),
    ]);
    expect(calls.mandateInserts[0]).toHaveLength(1);
    expect(r).toMatchObject({ mandates: 1, skipped: 1 });
  });

  it('skips a row without any start date', async () => {
    const { db, calls } = createDb({ officials: [existingOfficial()] });
    const r = await upsertConseillersEpci(db, [
      row({ mandateStartDate: '', functionStartDate: '' }),
    ]);
    expect(calls.mandateInserts).toHaveLength(0);
    expect(r.skipped).toBe(1);
  });

  it('resumes after the checkpoint and saves one per batch', async () => {
    const first = row();
    const second = row({
      epciSiren: '200030000',
      epciName: 'Ca Autre',
      lastName: 'MARTIN',
      firstName: 'Anne',
      birthDate: '1980-01-01',
    });
    vi.mocked(loadCheckpoint).mockReturnValue(
      `${first.epciSiren}|${first.communeCode}|${first.lastName}|${first.firstName}|${first.birthDate}`,
    );
    const { db, calls } = createDb();
    const r = await upsertConseillersEpci(db, [first, second]);
    expect(calls.officialInserts[0]).toHaveLength(1);
    expect(calls.officialInserts[0][0]).toMatchObject({ firstName: 'Anne' });
    expect(r.officials).toBe(1);
    expect(saveCheckpoint).toHaveBeenCalledTimes(1);
  });
});

describe('alias de fiche', () => {
  it('rattache une ligne dont la clé est un alias à la fiche cible sans créer de doublon', async () => {
    const { db, calls } = createDb({
      officials: [existingOfficial({ id: 'off-1', birthDate: '1990-10-31' })],
      aliases: [
        {
          aliasKey: officialKey('Juvénal', 'TURPIN', '1980-10-31'),
          officialId: 'off-1',
        },
      ],
    });
    await upsertConseillersEpci(db, [row({ birthDate: '1980-10-31' })]);
    expect(calls.officialInserts).toEqual([]);
    expect(calls.mandateInserts.flat().map((m) => m.officialId)).toEqual([
      'off-1',
    ]);
  });
});
