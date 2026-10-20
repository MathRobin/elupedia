/**
 * Tests de upsertConseillersDep : historisation des remplacements (clôture + nouveau
 * mandat vs mise à jour en place) sur un mock Drizzle minimal.
 *
 * Le mock sert les SELECT dans l'ordre exact où le module les émet :
 * 1. officials (bulk), 2. mandats actifs du type (bulk), 3. pour chaque
 * conseiller, le mandat actif de cet official. Les INSERT alimentent
 * `store`, les UPDATE sont journalisés dans `updates` ; `batch` résout
 * simplement les requêtes déjà construites (leurs effets de bord ont eu
 * lieu de façon synchrone à la construction).
 */
import { describe, it, expect, vi } from 'vitest';
import type { RneConseillerDep } from '../sources/rne-conseillers-dep.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Thenable imitant un query builder Drizzle : `await`, `.where()` et
// `.limit()` renvoient tous les mêmes lignes.
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

  let selectCallIndex = 0;
  const updates: { table: string; set: Record<string, unknown> }[] = [];
  const db = {
    select: () => ({
      from: (t: unknown) =>
        (t as Record<symbol, string>)[Symbol.for('drizzle:Name')] ===
        'official_aliases'
          ? chain([])
          : chain(selectQueue[selectCallIndex++] ?? []),
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

const conseiller: RneConseillerDep = {
  departmentCode: '94',
  departmentName: 'Val-De-Marne',
  cantonCode: '01',
  cantonName: 'Canton de Créteil',
  lastName: 'Dupont',
  firstName: 'Jean',
  gender: 'M',
  birthDate: '1960-01-01',
  mandateStartDate: '2021-07-01',
  functionLabel: 'Conseiller départemental',
  functionStartDate: '2021-07-01',
};

describe('upsertConseillersDep — historisation des remplacements', () => {
  it('clôt le mandat existant et en ouvre un nouveau (atomique) quand la date change', async () => {
    const { db, store, updates } = createMockDb([
      [existingOfficial],
      [
        {
          id: 'mandate-1',
          officialId: 'official-1',
          district: 'Canton de Créteil',
          department: 'Val-De-Marne',
        },
      ],
      [{ id: 'mandate-1', startDate: '2015-03-29' }],
    ]);
    const { upsertConseillersDep } = await import('./conseillers-dep.js');

    const summary = await upsertConseillersDep(db as never, [conseiller]);

    expect(summary.replaced).toBe(1);
    expect(summary.mandates).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      table: 'mandates',
      set: { endDate: '2021-07-01' },
    });
    expect(store.mandates).toHaveLength(1);
    expect(store.mandates[0]).toMatchObject({
      officialId: 'official-1',
      type: 'conseiller_departemental',
      startDate: '2021-07-01',
    });
  });

  it('corrige la date en place sans historiser quand la nouvelle date est antérieure', async () => {
    const { db, store, updates } = createMockDb([
      [existingOfficial],
      [
        {
          id: 'mandate-1',
          officialId: 'official-1',
          district: 'Canton de Créteil',
          department: 'Val-De-Marne',
        },
      ],
      [{ id: 'mandate-1', startDate: '2026-01-01' }], // postérieure à la source
    ]);
    const { upsertConseillersDep } = await import('./conseillers-dep.js');

    const summary = await upsertConseillersDep(db as never, [conseiller]);

    expect(summary.replaced).toBe(0);
    expect(summary.mandates).toBe(1);
    expect(store.mandates).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].set).toMatchObject({
      startDate: '2021-07-01',
      endDate: null,
    });
  });

  it("insère un nouveau mandat quand aucun mandat actif n'existe", async () => {
    const { db, store } = createMockDb([[existingOfficial], [], []]);
    const { upsertConseillersDep } = await import('./conseillers-dep.js');

    const summary = await upsertConseillersDep(db as never, [conseiller]);

    expect(summary.replaced).toBe(0);
    expect(summary.mandates).toBe(1);
    expect(store.mandates).toHaveLength(1);
  });
});
