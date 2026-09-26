import { describe, it, expect, vi } from 'vitest';
import type { Senateur } from '../sources/senat.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeThenable(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return Object.assign(promise, {
    limit: (n: number) => Promise.resolve(rows.slice(0, n)),
  });
}

/**
 * Mock minimal, dans l'ordre exact des requêtes émises par upsertSenators :
 * officials par senatId, puis pour chaque mandat un select mandates (soit par
 * statut actif, soit par date de début exacte selon m.end_date).
 */
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
      from: () => ({
        where: () => makeThenable(selectQueue[i++] ?? []),
      }),
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
  };

  return { db, store, updates };
}

const existingOfficial = { id: 'official-1', slug: 'anne-marie-nedelec' };

const senateur: Senateur = {
  matricule: '12345',
  nom: 'Nédélec',
  prenom: 'Anne-Marie',
  sexe: 'F',
  date_naissance: '1953-05-23',
  circonscription: 'Haute-Marne',
  slug: 'anne-marie-nedelec',
  photo_url: 'https://example.com/photo.jpg',
  full: {},
  mandats: [
    { start_date: '2023-10-02', end_date: null, department: 'Haute-Marne' },
  ],
};

describe('upsertSenators — déduplication des mandats en cours', () => {
  it('updates the existing active mandate instead of inserting a duplicate when the start date changes', async () => {
    // Reproduit le bug réel : un mandat sénateur actif existe déjà en base
    // avec une date provisoire (fallback '2023-10-01' de fetchSenateurs), et
    // l'open data publie ensuite la vraie date ('2023-10-02'). L'ancien code
    // dédupliquait par égalité stricte de startDate et créait donc un second
    // mandat actif au lieu de corriger le premier.
    const { db, store, updates } = createMockDb([
      [existingOfficial], // officials by senatId
      [{ id: 'mandate-1' }], // mandates: mandat actif existant (peu importe sa startDate)
    ]);
    const { upsertSenators } = await import('./senators.js');

    const summary = await upsertSenators(db as never, [senateur]);

    expect(summary.mandates).toBe(0);
    expect(store.mandates).toHaveLength(0);
    expect(updates).toHaveLength(2); // update officials + update mandates
    const mandateUpdate = updates.find((u) => u.table === 'mandates');
    expect(mandateUpdate?.set).toMatchObject({
      startDate: '2023-10-02',
      endDate: null,
    });
  });

  it('inserts a new mandate when no active mandate exists yet', async () => {
    const { db, store } = createMockDb([
      [existingOfficial], // officials by senatId
      [], // mandates: aucun mandat actif existant
    ]);
    const { upsertSenators } = await import('./senators.js');

    const summary = await upsertSenators(db as never, [senateur]);

    expect(summary.mandates).toBe(1);
    expect(store.mandates).toHaveLength(1);
    expect(store.mandates[0]).toMatchObject({
      type: 'senateur',
      startDate: '2023-10-02',
    });
  });
});
