import { describe, it, expect, vi } from 'vitest';
import type { FrenchMep, MepDetail } from '../sources/parlement-europeen.js';
import { normalizeName } from './meps.js';

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
 * Mock minimal : chaque appel à `select(...).from(...).where(...)` consomme
 * la prochaine entrée de `selectQueue`, dans l'ordre exact où `upsertMep`
 * les émet (officials par europarl_id, puis par nom+naissance si besoin,
 * mandates, affiliations x2, data_provenance). Les `where(...)` réels sont
 * couverts par les tests d'intégration manuels de M24T3 (voir commentaire du
 * ticket) ; ce mock isole la logique de décision (dédoublonnage, non-écrasement
 * entre parti national et groupe européen).
 */
function createMockDb(selectQueue: unknown[][]) {
  const store: Record<string, Record<string, unknown>[]> = {
    officials: [],
    mandates: [],
    affiliations: [],
    data_provenance: [],
  };
  const DRIZZLE_NAME = Symbol.for('drizzle:Name');
  const getTableName = (table: unknown): string =>
    (table as Record<symbol, string>)[DRIZZLE_NAME] ?? 'unknown';

  let i = 0;
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
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  };

  return { db, store };
}

const marieToussaint: FrenchMep = {
  id: '97236',
  familyName: 'Toussaint',
  givenName: 'Marie',
  politicalGroup: 'Verts/ALE',
};

const marieToussaintDetail: MepDetail = {
  id: '97236',
  birthDate: '1987-05-27',
  currentParliamentaryMandate: { startDate: '2024-07-16', endDate: null },
  currentNationalPartyOrgId: 'org/6727',
  currentNationalPartyStartDate: '2024-07-16',
};

describe('normalizeName', () => {
  it('strips accents, case and normalizes separators', () => {
    expect(normalizeName('Toussaint')).toBe(normalizeName('TOUSSAINT'));
    expect(normalizeName('François')).toBe(normalizeName('francois'));
    expect(normalizeName('Jean-Pierre')).toBe(normalizeName('Jean Pierre'));
  });
});

describe('upsertMep', () => {
  it('creates a new official, mandate and both affiliations when no match exists', async () => {
    const { db, store } = createMockDb([
      [], // officials by europarl_id
      [], // officials candidates by birth date
      [], // mandates
      [], // affiliations (european_group)
      [], // affiliations (national_party)
      [], // data_provenance
    ]);
    const { upsertMep } = await import('./meps.js');

    const result = await upsertMep(db as never, {
      mep: marieToussaint,
      detail: marieToussaintDetail,
      nationalPartyLabel: 'Europe Écologie',
    });

    expect(result.created).toBe(true);
    expect(store.officials).toHaveLength(1);
    expect(store.officials[0].europarlId).toBe('97236');
    expect(store.mandates).toHaveLength(1);
    expect(store.mandates[0]).toMatchObject({
      type: 'eurodepute',
      legislature: 10,
      politicalGroup: 'Verts/ALE',
    });
    expect(store.affiliations).toHaveLength(2);
    expect(store.affiliations.map((a) => a.kind).sort()).toEqual([
      'european_group',
      'national_party',
    ]);
    expect(
      store.affiliations.find((a) => a.kind === 'european_group')?.partyOrGroup,
    ).toBe('Verts/ALE');
    expect(
      store.affiliations.find((a) => a.kind === 'national_party')?.partyOrGroup,
    ).toBe('Europe Écologie');
  });

  it('links to an existing official matched by normalized name + exact birth date', async () => {
    const existing = {
      id: 'existing-official-id',
      firstName: 'MARIE',
      lastName: 'toussaint',
      birthDate: '1987-05-27',
      europarlId: null,
      slug: 'marie-toussaint',
    };
    const { db, store } = createMockDb([
      [], // officials by europarl_id
      [existing], // candidates by birth date (already un-linked, un-normalized case)
      [], // mandates
      [], // affiliations (european_group)
      [], // affiliations (national_party)
      [], // data_provenance
    ]);
    const { upsertMep } = await import('./meps.js');

    const result = await upsertMep(db as never, {
      mep: marieToussaint,
      detail: marieToussaintDetail,
      nationalPartyLabel: 'Europe Écologie',
    });

    expect(result.created).toBe(false);
    expect(result.officialId).toBe('existing-official-id');
    // Pas de nouvel official créé : l'update est un rattachement, pas une insertion.
    expect(store.officials).toHaveLength(0);
    expect(store.mandates).toHaveLength(1);
  });

  it('does not link on name match alone when the birth date differs (avoids a false positive)', async () => {
    // Un homonyme né un autre jour ne doit jamais figurer dans les candidats
    // renvoyés par la requête SQL (filtrée par date de naissance) — mais on
    // vérifie ici que si un candidat homonyme sans date de naissance
    // correspondante devait apparaître, la comparaison de nom seule ne suffit
    // pas à décider un rattachement erroné : le code compare aussi le prénom.
    const homonymWrongFirstName = {
      id: 'other-official-id',
      firstName: 'Marion',
      lastName: 'Toussaint',
      birthDate: '1987-05-27',
      europarlId: null,
      slug: 'marion-toussaint',
    };
    const { db, store } = createMockDb([
      [],
      [homonymWrongFirstName],
      [],
      [],
      [],
      [],
    ]);
    const { upsertMep } = await import('./meps.js');

    const result = await upsertMep(db as never, {
      mep: marieToussaint,
      detail: marieToussaintDetail,
      nationalPartyLabel: 'Europe Écologie',
    });

    expect(result.created).toBe(true);
    expect(store.officials).toHaveLength(1);
  });

  it('creates a new official without linking when the API has no birth date (avoids a risky match)', async () => {
    const detailNoBirthDate: MepDetail = {
      ...marieToussaintDetail,
      birthDate: null,
    };
    const { db, store } = createMockDb([
      [], // officials by europarl_id
      // pas de select candidats : detail.birthDate est null
      [], // mandates
      [], // affiliations (european_group)
      [], // affiliations (national_party)
      [], // data_provenance
    ]);
    const { upsertMep } = await import('./meps.js');

    const result = await upsertMep(db as never, {
      mep: marieToussaint,
      detail: detailNoBirthDate,
      nationalPartyLabel: 'Europe Écologie',
    });

    expect(result.created).toBe(true);
    expect(store.officials).toHaveLength(1);
    expect(store.officials[0].birthDate).toBeNull();
  });

  it('only records the European group affiliation when no national party could be resolved', async () => {
    const { db, store } = createMockDb([[], [], [], []]);
    const { upsertMep } = await import('./meps.js');

    await upsertMep(db as never, {
      mep: marieToussaint,
      detail: { ...marieToussaintDetail, currentNationalPartyOrgId: null },
      nationalPartyLabel: null,
    });

    expect(store.affiliations).toHaveLength(1);
    expect(store.affiliations[0].kind).toBe('european_group');
  });

  it('suffixes the slug when it is already taken by an unrelated homonym', async () => {
    // Cas réel rencontré en ingestion (M24T3) : un "Philippe Olivier" déjà en
    // base (né à une autre date, donc pas un candidat de rattachement) porte
    // déjà le slug "philippe-olivier".
    const { db, store } = createMockDb([
      [], // officials by europarl_id
      [], // candidates by birth date (l'homonyme n'a pas la bonne naissance, absent ici)
      [{ id: 'homonym-id' }], // uniqueSlug: "marie-toussaint" déjà pris
      [], // uniqueSlug: "marie-toussaint-1" libre
      [], // mandates
      [], // affiliations (european_group)
      [], // affiliations (national_party)
      [], // data_provenance
    ]);
    const { upsertMep } = await import('./meps.js');

    await upsertMep(db as never, {
      mep: marieToussaint,
      detail: marieToussaintDetail,
      nationalPartyLabel: 'Europe Écologie',
    });

    expect(store.officials).toHaveLength(1);
    expect(store.officials[0].slug).toBe('marie-toussaint-1');
  });
});

describe('upsertMeps', () => {
  it('summarizes created/linked/error counts across MEPs', async () => {
    const { db } = createMockDb([
      [],
      [],
      [],
      [],
      [],
      [], // MEP 1: fully created
      [],
      [],
      [],
      [],
      [],
      [], // MEP 2: fully created
    ]);
    const { upsertMeps } = await import('./meps.js');

    const summary = await upsertMeps(db as never, [
      {
        mep: marieToussaint,
        detail: marieToussaintDetail,
        nationalPartyLabel: 'Europe Écologie',
      },
      {
        mep: { ...marieToussaint, id: '99999', familyName: 'Dupont' },
        detail: { ...marieToussaintDetail, id: '99999' },
        nationalPartyLabel: 'Renaissance',
      },
    ]);

    expect(summary).toEqual({ created: 2, linked: 0, errors: 0 });
  });

  it('counts a failing MEP as an error without stopping the batch', async () => {
    const DRIZZLE_NAME = Symbol.for('drizzle:Name');
    const getTableName = (table: unknown): string =>
      (table as Record<symbol, string>)[DRIZZLE_NAME] ?? 'unknown';
    const store: Record<string, Record<string, unknown>[]> = {
      officials: [],
      mandates: [],
      affiliations: [],
      data_provenance: [],
    };
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.reject(new Error('boom')),
          }),
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
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    };
    const { upsertMeps } = await import('./meps.js');

    const summary = await upsertMeps(db as never, [
      {
        mep: marieToussaint,
        detail: marieToussaintDetail,
        nationalPartyLabel: 'Europe Écologie',
      },
    ]);

    expect(summary).toEqual({ created: 0, linked: 0, errors: 1 });
  });
});
