import { describe, it, expect } from 'vitest';
import type { Depute } from '../sources/assemblee-nationale.js';

const mockDepute: Depute = {
  id_an: 'PA100001',
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
  photo_url:
    'https://www2.assemblee-nationale.fr/static/tribun/17/photos/100001.jpg',
  mandat_type: 'depute',
  full: { uid: 'PA100001', raw: true },
  allMandates: [
    {
      type: 'depute',
      nom_circo: 'Gironde',
      num_deptmt: '33',
      num_circo: 3,
      mandat_debut: '2022-06-19',
      groupe_sigle: 'RE',
    },
  ],
};

const DRIZZLE_NAME = Symbol.for('drizzle:Name');

function getTableName(table: unknown): string {
  return (table as Record<symbol, string>)[DRIZZLE_NAME] ?? 'unknown';
}

function createMockDb() {
  const store: Record<string, Record<string, unknown>[]> = {
    officials: [],
    mandates: [],
    data_provenance: [],
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

  it('writes data_provenance for each official', async () => {
    const { db, store } = createMockDb();
    const { upsertOfficials } = await import('./officials.js');

    await upsertOfficials(db as never, [mockDepute]);

    expect(store.data_provenance).toHaveLength(1);
    const prov = store.data_provenance[0];
    expect(prov.sourceTable).toBe('officials');
    expect(prov.sourceRecordId).toBe('PA100001');
    expect(prov.sourceName).toBe('Assemblée nationale - Open Data');
    expect(prov.sourceUrl).toContain('PA100001');
    expect(prov.legalBasis).toBeTruthy();
    expect(prov.rawData).toEqual({ uid: 'PA100001', raw: true });
    expect(prov.fetchedAt).toBeInstanceOf(Date);
  });

  it('handles null raw_data gracefully', async () => {
    const { db, store } = createMockDb();
    const { upsertOfficials } = await import('./officials.js');

    const deputeNoFull = { ...mockDepute, full: undefined };
    await upsertOfficials(db as never, [deputeNoFull]);

    expect(store.data_provenance).toHaveLength(1);
    expect(store.data_provenance[0].rawData).toBeNull();
  });
});
