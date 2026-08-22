import { describe, it, expect } from 'vitest';
import type { Depute } from '../sources/nosdeputes.js';

const mockDepute: Depute = {
  id: 1,
  nom: 'Dupont',
  prenom: 'Marie',
  sexe: 'F',
  date_naissance: '1975-03-14',
  num_deptmt: '33',
  nom_circo: 'Gironde',
  num_circo: 3,
  mandat_debut: '2022-06-19',
  groupe_sigle: 'RE',
  slug: 'marie-dupont',
  id_an: 'PA100001',
  photo_url: 'https://example.com/photo.jpg',
};

const DRIZZLE_NAME = Symbol.for('drizzle:Name');

function getTableName(table: unknown): string {
  return (table as Record<symbol, string>)[DRIZZLE_NAME] ?? 'unknown';
}

function createMockDb() {
  const store: Record<string, Record<string, unknown>[]> = {
    officials: [],
    mandates: [],
  };

  let currentTable = '';

  const db = {
    select: () => ({
      from: (table: unknown) => {
        currentTable = getTableName(table);
        return {
          where: () => ({
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
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  };

  return { db, store };
}

describe('upsertOfficials', () => {
  it('inserts a new official and mandate', async () => {
    const { db, store } = createMockDb();
    const { upsertOfficials } = await import('./officials.js');

    const results = await upsertOfficials(db as never, [mockDepute]);

    expect(results).toHaveLength(1);
    expect(results[0].anId).toBe('PA100001');
    expect(store.officials).toHaveLength(1);
    expect(store.mandates).toHaveLength(1);
    expect(store.officials[0].firstName).toBe('Marie');
  });

  it('is idempotent — second run does not create duplicates', async () => {
    const { db, store } = createMockDb();
    const { upsertOfficials } = await import('./officials.js');

    await upsertOfficials(db as never, [mockDepute]);
    await upsertOfficials(db as never, [mockDepute]);

    expect(store.officials).toHaveLength(1);
    expect(store.mandates).toHaveLength(1);
  });

  it('handles depute without id_an', async () => {
    const { db, store } = createMockDb();
    const { upsertOfficials } = await import('./officials.js');
    const deputeNoAnId = { ...mockDepute, id_an: undefined };

    const results = await upsertOfficials(db as never, [deputeNoAnId]);

    expect(results[0].anId).toBe('nosdeputes-1');
    expect(store.officials).toHaveLength(1);
  });
});
