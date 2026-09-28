import { describe, it, expect, vi } from 'vitest';
import type { RneConseillerFde } from '../sources/rne-conseillers-fde.js';

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

const conseiller: RneConseillerFde = {
  afeCode: '1',
  afeName: 'Canada',
  consularCode: '101',
  consularName: 'Canada - 1re circonscription',
  lastName: 'Dellapina',
  firstName: 'Olivier',
  gender: 'M',
  birthDate: '1975-09-17',
  mandateStartDate: '2021-05-31',
};

describe('upsertConseillersFde — historisation des remplacements', () => {
  it('clôt le mandat existant et en ouvre un nouveau (atomique) quand la date change', async () => {
    const { db, store, updates } = createMockDb([
      [existingOfficial],
      [
        {
          id: 'mandate-1',
          officialId: 'official-1',
          district: 'Canada - 1re circonscription',
        },
      ],
      [{ id: 'mandate-1', startDate: '2014-05-25' }],
    ]);
    const { upsertConseillersFde } = await import('./conseillers-fde.js');

    const summary = await upsertConseillersFde(db as never, [conseiller]);

    expect(summary.replaced).toBe(1);
    expect(summary.mandates).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      table: 'mandates',
      set: { endDate: '2021-05-31' },
    });
    expect(store.mandates).toHaveLength(1);
    expect(store.mandates[0]).toMatchObject({
      officialId: 'official-1',
      type: 'conseiller_francais_etranger',
      district: 'Canada - 1re circonscription',
      department: 'Français établis hors de France',
      startDate: '2021-05-31',
    });
  });

  it('met juste à jour la ligne existante sans historiser quand la date est inchangée', async () => {
    const { db, store, updates } = createMockDb([
      [existingOfficial],
      [
        {
          id: 'mandate-1',
          officialId: 'official-1',
          district: 'Canada - 1re circonscription',
        },
      ],
      [{ id: 'mandate-1', startDate: '2021-05-31' }],
    ]);
    const { upsertConseillersFde } = await import('./conseillers-fde.js');

    const summary = await upsertConseillersFde(db as never, [conseiller]);

    expect(summary.replaced).toBe(0);
    expect(summary.mandates).toBe(1);
    expect(store.mandates).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].set).toMatchObject({
      startDate: '2021-05-31',
      endDate: null,
    });
  });

  it("insère un nouveau mandat quand aucun mandat actif n'existe", async () => {
    const { db, store } = createMockDb([[existingOfficial], [], []]);
    const { upsertConseillersFde } = await import('./conseillers-fde.js');

    const summary = await upsertConseillersFde(db as never, [conseiller]);

    expect(summary.replaced).toBe(0);
    expect(summary.mandates).toBe(1);
    expect(store.mandates).toHaveLength(1);
    expect(store.mandates[0]).toMatchObject({
      department: 'Français établis hors de France',
    });
  });

  it("saute la ligne quand la source n'a pas de date de mandat", async () => {
    const { db, store, updates } = createMockDb([[existingOfficial], [], []]);
    const { upsertConseillersFde } = await import('./conseillers-fde.js');

    const summary = await upsertConseillersFde(db as never, [
      { ...conseiller, mandateStartDate: '' },
    ]);

    expect(summary.skipped).toBe(1);
    expect(summary.mandates).toBe(0);
    expect(store.mandates).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});
