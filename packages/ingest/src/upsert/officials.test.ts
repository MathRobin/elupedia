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
        const rows = store[currentTable]?.filter(() => true) ?? [];
        return Object.assign(Promise.resolve(rows), {
          where: () => ({
            limit: () => Promise.resolve(rows),
          }),
        });
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

describe('upsertOfficials — mandat en cours cross-source (AN + Sénat)', () => {
  function makeThenable(rows: unknown[]) {
    const promise = Promise.resolve(rows);
    return Object.assign(promise, {
      limit: (n: number) => Promise.resolve(rows.slice(0, n)),
    });
  }

  /**
   * Mock à file d'attente : chaque select consomme la prochaine entrée, dans
   * l'ordre exact émis par upsertOfficials (officials par anId, puis pour
   * chaque mandat un select mandates, puis data_provenance).
   */
  function createQueueMockDb(selectQueue: unknown[][]) {
    const DRIZZLE_NAME = Symbol.for('drizzle:Name');
    const getTableName = (table: unknown): string =>
      (table as Record<symbol, string>)[DRIZZLE_NAME] ?? 'unknown';
    let i = 0;
    const inserts: { table: string; values: Record<string, unknown> }[] = [];
    const updates: { table: string; set: Record<string, unknown> }[] = [];
    const db = {
      select: () => ({
        from: () => {
          const rows = selectQueue[i++] ?? [];
          return Object.assign(Promise.resolve(rows), {
            where: () => makeThenable(rows),
          });
        },
      }),
      insert: (table: unknown) => {
        const name = getTableName(table);
        return {
          values: (values: Record<string, unknown>) => {
            inserts.push({ table: name, values });
            const row = { id: crypto.randomUUID(), ...values };
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
    };
    return { db, inserts, updates };
  }

  const existingOfficial = { id: 'official-1', slug: 'anne-marie-nedelec' };

  // Reproduit le cas réel : l'AN republie le mandat sénateur en cours d'une
  // personne avec une date de début différente de celle du Sénat, et sans
  // info de circonscription (mLieu absent côté AN pour ce mandat).
  const senateurMandateFromAn: Depute = {
    ...mockDepute,
    id_an: 'PA999',
    mandat_type: 'senateur',
    allMandates: [
      {
        type: 'senateur',
        nom_circo: '',
        num_deptmt: '',
        num_circo: 0,
        mandat_debut: '2023-10-04',
      },
    ],
  };

  it('updates the existing active senator mandate instead of duplicating it when the AN source has a different start date', async () => {
    const { db, inserts, updates } = createQueueMockDb([
      [], // officials.slug (uniqueSlug pool)
      [existingOfficial], // officials by anId
      [{ id: 'mandate-1', department: 'Haute-Marne' }], // mandates: mandat actif déjà connu (venant du Sénat)
      [], // data_provenance
    ]);

    const { upsertOfficials } = await import('./officials.js');
    await upsertOfficials(db as never, [senateurMandateFromAn]);

    expect(inserts.filter((i) => i.table === 'mandates')).toHaveLength(0);
    const mandateUpdate = updates.find((u) => u.table === 'mandates');
    expect(mandateUpdate?.set).toMatchObject({
      startDate: '2023-10-04',
      department: 'Haute-Marne', // pas écrasé par la valeur vide de l'AN
    });
  });

  it('inserts a new mandate when no active mandate exists yet', async () => {
    const { db, inserts } = createQueueMockDb([
      [], // officials.slug (uniqueSlug pool)
      [existingOfficial], // officials by anId
      [], // mandates: aucun mandat actif existant
      [], // data_provenance
    ]);

    const { upsertOfficials } = await import('./officials.js');
    await upsertOfficials(db as never, [senateurMandateFromAn]);

    const mandateInsert = inserts.find((i) => i.table === 'mandates');
    expect(mandateInsert?.values).toMatchObject({
      type: 'senateur',
      startDate: '2023-10-04',
      department: null,
    });
  });
});
