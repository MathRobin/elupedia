import { describe, it, expect, vi } from 'vitest';
import type { RneMaire } from '../sources/rne-maires.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../utils/checkpoint.js', () => ({
  loadCheckpoint: () => null,
  saveCheckpoint: () => {},
  clearCheckpoint: () => {},
}));

function chain(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return Object.assign(promise, {
    where: () => chain(rows),
    limit: (n: number) => Promise.resolve(rows.slice(0, n)),
  });
}

/**
 * Mock minimal, dans l'ordre exact des requêtes émises par upsertMayors :
 * officials (bulk), mandates actifs de type maire (bulk), puis pour chaque
 * maire un select mandates actif par officialId+communeCode.
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
    // Les effets de bord (push dans `updates`/`store`) ont déjà eu lieu de
    // façon synchrone à la construction de chaque requête ci-dessus ; pour
    // ce mock, batch se contente donc de résoudre les promesses déjà prêtes.
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

const maire: RneMaire = {
  departmentCode: '94',
  departmentName: 'Val-De-Marne',
  communeCode: '94001',
  communeName: 'Ablon-sur-Seine',
  lastName: 'Dupont',
  firstName: 'Jean',
  gender: 'M',
  birthDate: '1960-01-01',
  mandateStartDate: '2026-03-15',
  functionStartDate: '2026-03-15',
};

describe('upsertMayors — historisation des réélections', () => {
  it('clôt le mandat existant et en ouvre un nouveau quand la date de mandat change', async () => {
    // Reproduit le bug réel : un même maire réélu voyait sa ligne de mandat
    // écrasée en place (nouvelle startDate sur la ligne existante), perdant
    // toute trace de son mandat précédent.
    const { db, store, updates } = createMockDb([
      [existingOfficial], // officials (bulk)
      [{ id: 'mandate-1', officialId: 'official-1', communeCode: '94001' }], // mandats actifs "maire" (bulk)
      [{ id: 'mandate-1', startDate: '2020-05-18' }], // mandat actif existant pour ce maire/cette commune
    ]);
    const { upsertMayors } = await import('./mayors.js');

    const summary = await upsertMayors(db as never, [maire]);

    expect(summary.reelected).toBe(1);
    expect(summary.mandates).toBe(1);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      table: 'mandates',
      set: { endDate: '2026-03-15' },
    });

    expect(store.mandates).toHaveLength(1);
    expect(store.mandates[0]).toMatchObject({
      officialId: 'official-1',
      type: 'maire',
      communeCode: '94001',
      startDate: '2026-03-15',
    });
  });

  it('met juste à jour les métadonnées quand la date de mandat est inchangée', async () => {
    const { db, store, updates } = createMockDb([
      [existingOfficial],
      [{ id: 'mandate-1', officialId: 'official-1', communeCode: '94001' }],
      [{ id: 'mandate-1', startDate: '2026-03-15' }], // même date que la source
    ]);
    const { upsertMayors } = await import('./mayors.js');

    const summary = await upsertMayors(db as never, [maire]);

    expect(summary.reelected).toBe(0);
    expect(summary.mandates).toBe(1);
    expect(store.mandates).toHaveLength(0);

    expect(updates).toHaveLength(1);
    expect(updates[0].set).toMatchObject({
      startDate: '2026-03-15',
      endDate: null,
    });
  });

  it('corrige la date en place sans historiser quand la nouvelle date est antérieure à celle en base', async () => {
    // La source précise une date provisoire, puis une date plus exacte et
    // plus ancienne (ex. RNE corrige une date de prise de fonction) : ce
    // n'est pas une réélection, juste une correction de la même période.
    const { db, store, updates } = createMockDb([
      [existingOfficial],
      [{ id: 'mandate-1', officialId: 'official-1', communeCode: '94001' }],
      [{ id: 'mandate-1', startDate: '2026-04-01' }], // postérieure à la source
    ]);
    const { upsertMayors } = await import('./mayors.js');

    const summary = await upsertMayors(db as never, [maire]);

    expect(summary.reelected).toBe(0);
    expect(summary.mandates).toBe(1);
    expect(store.mandates).toHaveLength(0);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      table: 'mandates',
      set: { startDate: '2026-03-15', endDate: null },
    });
  });

  it("n'écrit rien et compte un skip quand la source n'a aucune date de mandat/fonction", async () => {
    const maireSansDate: RneMaire = {
      ...maire,
      mandateStartDate: '',
      functionStartDate: '',
    };
    const { db, store, updates } = createMockDb([
      [existingOfficial],
      [{ id: 'mandate-1', officialId: 'official-1', communeCode: '94001' }],
      [{ id: 'mandate-1', startDate: '2020-05-18' }],
    ]);
    const { upsertMayors } = await import('./mayors.js');

    const summary = await upsertMayors(db as never, [maireSansDate]);

    expect(summary.skipped).toBe(1);
    expect(summary.mandates).toBe(0);
    expect(summary.reelected).toBe(0);
    expect(updates).toHaveLength(0);
    expect(store.mandates).toHaveLength(0);
  });

  it("insère un nouveau mandat quand aucun mandat actif n'existe", async () => {
    const { db, store } = createMockDb([
      [existingOfficial],
      [], // aucun mandat "maire" actif en base
      [], // donc aucun mandat existant pour ce maire/cette commune
    ]);
    const { upsertMayors } = await import('./mayors.js');

    const summary = await upsertMayors(db as never, [maire]);

    expect(summary.reelected).toBe(0);
    expect(summary.mandates).toBe(1);
    expect(store.mandates).toHaveLength(1);
    expect(store.mandates[0]).toMatchObject({
      type: 'maire',
      startDate: '2026-03-15',
    });
  });
});
