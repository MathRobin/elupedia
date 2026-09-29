import { describe, it, expect, vi } from 'vitest';
import type { RneMembreAfe } from '../sources/rne-membres-afe.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function chain(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return Object.assign(promise, {
    where: () => chain(rows),
    limit: (n: number) => Promise.resolve(rows.slice(0, n)),
  });
}

function createMockDb(selectQueue: unknown[][]) {
  const store: Record<string, Record<string, unknown>[]> = {
    officials: [],
    mandates: [],
  };
  const DRIZZLE_NAME = Symbol.for('drizzle:Name');
  const getTableName = (table: unknown): string =>
    (table as Record<symbol, string>)[DRIZZLE_NAME] ?? 'unknown';

  let i = 0;
  const updates: { table: string; set: Record<string, unknown> }[] = [];
  const db = {
    select: () => ({
      from: () => chain(selectQueue[i++] ?? []),
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
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table: getTableName(table), set: values });
        return { where: () => Promise.resolve() };
      },
    }),
    batch: (queries: unknown[]) => Promise.all(queries),
  };

  return { db, store, updates };
}

const existingOfficial = {
  id: 'official-1',
  firstName: 'Olivier',
  lastName: 'Dellapina',
  birthDate: '1975-09-17',
  slug: 'olivier-dellapina',
};

const membre: RneMembreAfe = {
  afeCode: '1',
  afeName: 'Canada',
  lastName: 'Dellapina',
  firstName: 'Olivier',
  gender: 'M',
  birthDate: '1975-09-17',
  mandateStartDate: '2021-12-06',
};

describe('upsertMembresAfe — historisation des remplacements', () => {
  it('clôt le mandat existant et en ouvre un nouveau (atomique) quand la date change', async () => {
    const { db, store, updates } = createMockDb([
      [existingOfficial],
      [
        {
          id: 'mandate-1',
          officialId: 'official-1',
          district: 'Canada',
        },
      ],
      [{ id: 'mandate-1', startDate: '2014-06-01' }],
    ]);
    const { upsertMembresAfe } = await import('./membres-afe.js');

    const summary = await upsertMembresAfe(db as never, [membre]);

    expect(summary.replaced).toBe(1);
    expect(summary.mandates).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      table: 'mandates',
      set: { endDate: '2021-12-06' },
    });
    expect(store.mandates).toHaveLength(1);
    expect(store.mandates[0]).toMatchObject({
      officialId: 'official-1',
      type: 'membre_afe',
      district: 'Canada',
      department: 'Français établis hors de France',
      startDate: '2021-12-06',
    });
  });

  it('met juste à jour la ligne existante sans historiser quand la date est inchangée', async () => {
    const { db, store, updates } = createMockDb([
      [existingOfficial],
      [
        {
          id: 'mandate-1',
          officialId: 'official-1',
          district: 'Canada',
        },
      ],
      [{ id: 'mandate-1', startDate: '2021-12-06' }],
    ]);
    const { upsertMembresAfe } = await import('./membres-afe.js');

    const summary = await upsertMembresAfe(db as never, [membre]);

    expect(summary.replaced).toBe(0);
    expect(summary.mandates).toBe(1);
    expect(store.mandates).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].set).toMatchObject({
      startDate: '2021-12-06',
      endDate: null,
    });
  });

  it("insère un nouveau mandat quand aucun mandat actif n'existe", async () => {
    const { db, store } = createMockDb([[existingOfficial], [], []]);
    const { upsertMembresAfe } = await import('./membres-afe.js');

    const summary = await upsertMembresAfe(db as never, [membre]);

    expect(summary.replaced).toBe(0);
    expect(summary.mandates).toBe(1);
    expect(store.mandates).toHaveLength(1);
    expect(store.mandates[0]).toMatchObject({
      type: 'membre_afe',
      department: 'Français établis hors de France',
    });
  });

  it("saute la ligne quand la source n'a pas de date de mandat", async () => {
    const { db, store, updates } = createMockDb([[existingOfficial], [], []]);
    const { upsertMembresAfe } = await import('./membres-afe.js');

    const summary = await upsertMembresAfe(db as never, [
      { ...membre, mandateStartDate: '' },
    ]);

    expect(summary.skipped).toBe(1);
    expect(summary.mandates).toBe(0);
    expect(store.mandates).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});
