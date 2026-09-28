import { describe, it, expect, vi } from 'vitest';
import type { RneMembreAssemblee } from '../sources/rne-membres-assemblee.js';

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
  firstName: 'Jean',
  lastName: 'Dupont',
  birthDate: '1960-01-01',
  slug: 'jean-dupont',
};

const membre: RneMembreAssemblee = {
  regionCode: '94',
  regionName: 'Corse',
  departmentCode: '2A',
  departmentName: 'Corse-du-Sud',
  collectiviteCode: '94',
  collectiviteName: 'Assemblée de Corse',
  circonscriptionCode: '',
  circonscriptionName: '',
  lastName: 'Dupont',
  firstName: 'Jean',
  gender: 'M',
  birthDate: '1960-01-01',
  mandateStartDate: '2021-07-02',
  functionLabel: 'Conseiller à l’Assemblée de Corse',
  functionStartDate: '2021-07-02',
};

describe('upsertMembresAssemblee — historisation des remplacements', () => {
  it('clôt le mandat existant et en ouvre un nouveau (atomique) quand la date change', async () => {
    const { db, store, updates } = createMockDb([
      [existingOfficial],
      [
        {
          id: 'mandate-1',
          officialId: 'official-1',
          district: 'Assemblée de Corse',
          department: 'Assemblée de Corse',
        },
      ],
      [{ id: 'mandate-1', startDate: '2017-12-18' }],
    ]);
    const { upsertMembresAssemblee } = await import('./membres-assemblee.js');

    const summary = await upsertMembresAssemblee(db as never, [membre]);

    expect(summary.replaced).toBe(1);
    expect(summary.mandates).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      table: 'mandates',
      set: { endDate: '2021-07-02' },
    });
    expect(store.mandates).toHaveLength(1);
    expect(store.mandates[0]).toMatchObject({
      officialId: 'official-1',
      type: 'membre_assemblee_statut_particulier',
      startDate: '2021-07-02',
    });
  });

  it("insère un nouveau mandat quand aucun mandat actif n'existe", async () => {
    const { db, store } = createMockDb([[existingOfficial], [], []]);
    const { upsertMembresAssemblee } = await import('./membres-assemblee.js');

    const summary = await upsertMembresAssemblee(db as never, [membre]);

    expect(summary.replaced).toBe(0);
    expect(summary.mandates).toBe(1);
    expect(store.mandates).toHaveLength(1);
  });
});
