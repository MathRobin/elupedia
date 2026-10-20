/**
 * Tests de upsertConseillersReg : historisation des remplacements (clôture + nouveau
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
import type { RneConseillerReg } from '../sources/rne-conseillers-reg.js';

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

const conseiller: RneConseillerReg = {
  regionCode: '11',
  regionName: 'Île-de-France',
  sectionCode: '94',
  sectionName: 'Val-De-Marne',
  lastName: 'Dupont',
  firstName: 'Jean',
  gender: 'M',
  birthDate: '1960-01-01',
  mandateStartDate: '2021-07-02',
  functionLabel: 'Conseiller régional',
  functionStartDate: '2021-07-02',
};

describe('upsertConseillersReg — historisation des remplacements', () => {
  it('clôt le mandat existant et en ouvre un nouveau (atomique) quand la date change', async () => {
    const { db, store, updates } = createMockDb([
      [existingOfficial],
      [
        {
          id: 'mandate-1',
          officialId: 'official-1',
          district: 'Île-de-France',
          department: 'Val-De-Marne',
        },
      ],
      [{ id: 'mandate-1', startDate: '2015-12-18' }],
    ]);
    const { upsertConseillersReg } = await import('./conseillers-reg.js');

    const summary = await upsertConseillersReg(db as never, [conseiller]);

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
      type: 'conseiller_regional',
      startDate: '2021-07-02',
    });
  });

  it("insère un nouveau mandat quand aucun mandat actif n'existe", async () => {
    const { db, store } = createMockDb([[existingOfficial], [], []]);
    const { upsertConseillersReg } = await import('./conseillers-reg.js');

    const summary = await upsertConseillersReg(db as never, [conseiller]);

    expect(summary.replaced).toBe(0);
    expect(summary.mandates).toBe(1);
    expect(store.mandates).toHaveLength(1);
  });
});
