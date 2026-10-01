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

const DRIZZLE_NAME = Symbol.for('drizzle:Name');
function getTableName(table: unknown): string {
  return (table as Record<symbol, string>)[DRIZZLE_NAME] ?? 'unknown';
}

/**
 * Mock DB pour tester la résilience (retry + arrêt propre après échecs
 * consécutifs) plutôt que la logique métier : le premier select
 * (officials par senatId) échoue `failOfficialsSelects` fois avant de
 * laisser passer, comme dans senat-parliamentary-activity.test.ts.
 * `date_naissance: null` sur les sénateurs de test évite le select
 * supplémentaire de rapprochement AN, pour un comptage prévisible.
 */
function createResilienceMockDb(failOfficialsSelects = 0) {
  const store: Record<string, Record<string, unknown>[]> = {
    officials: [],
    mandates: [],
  };
  let remainingFailures = failOfficialsSelects;
  let officialsSelectCount = 0;

  const db = {
    select: () => ({
      from: (table: unknown) => {
        const name = getTableName(table);
        if (name === 'officials') {
          officialsSelectCount++;
          if (remainingFailures > 0) {
            remainingFailures--;
            return {
              where: () => ({
                limit: () =>
                  Promise.reject(new Error('fetch failed (blip réseau)')),
              }),
            };
          }
        }
        return { where: () => ({ limit: () => Promise.resolve([]) }) };
      },
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
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };

  return { db, store, getOfficialsSelectCount: () => officialsSelectCount };
}

function makeSenateur(matricule: string): Senateur {
  return {
    matricule,
    nom: `Nom${matricule}`,
    prenom: `Prenom${matricule}`,
    sexe: 'F',
    date_naissance: null,
    circonscription: 'Haute-Marne',
    slug: `prenom${matricule}-nom${matricule}`,
    photo_url: 'https://example.com/photo.jpg',
    full: {},
    mandats: [],
  };
}

describe('upsertSenators — résilience aux blips réseau (incident du 01/10/2026)', () => {
  it('retries an isolated transient failure and still processes the sénateur', async () => {
    const { db, store } = createResilienceMockDb(1); // échoue une seule fois : absorbé par le retry

    const { upsertSenators } = await import('./senators.js');
    const summary = await upsertSenators(db as never, [makeSenateur('1A')]);

    expect(summary.officials).toBe(1);
    expect(store.officials).toHaveLength(1);
  });

  it('stops cleanly (without throwing) after too many consecutive failures, keeping progress already made', async () => {
    // Échoue en continu : chaque tentative (les 2 essais du retry compris)
    // échoue, jamais absorbée — simule une panne systémique plutôt qu'un
    // blip isolé.
    const { db, store, getOfficialsSelectCount } =
      createResilienceMockDb(Infinity);

    const { upsertSenators } = await import('./senators.js');
    const senateurs = Array.from({ length: 7 }, (_, i) =>
      makeSenateur(`${i}A`),
    );

    // Ne doit jamais lever : run-senat.ts rejoue toute la fonction sur une
    // exception (withRetry de run-helpers.ts), ce qui repartirait du
    // premier sénateur au lieu de s'arrêter proprement.
    const summary = await upsertSenators(db as never, senateurs);

    expect(summary.officials).toBe(0);
    expect(store.officials).toHaveLength(0);
    // 5 sénateurs tentés (seuil MAX_CONSECUTIVE_FAILURES) × 2 essais chacun
    // (withRetry) = 10, jamais les 7 × 2 = 14 qu'un parcours complet ferait.
    expect(getOfficialsSelectCount()).toBeLessThanOrEqual(10);
  });
});
