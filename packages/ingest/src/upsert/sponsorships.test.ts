/**
 * Test de `upsertSponsorships` avec un faux `db` : le dédoublonnage ne doit
 * pas écarter des élus homonymes (mandat, circonscription ou candidat
 * différents), mais doit écarter une ligne déjà enregistrée ; un nom en
 * doublon dans le fichier n'est pas rattaché à une fiche.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ParrainageRow } from '../sources/parrainages.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type Existing = {
  rawElectedName: string;
  rawFunction: string;
  rawCircumscription: string | null;
  rawDepartment: string | null;
  candidateName: string;
};

function fakeDb(
  officialRows: { id: string; firstName: string; lastName: string }[],
  existing: Existing[],
) {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    select: (cols: Record<string, unknown>) => ({
      from: () => {
        const rows = 'lastName' in cols ? officialRows : existing;
        const p = Promise.resolve(rows) as Promise<unknown[]> & {
          where: () => Promise<unknown[]>;
        };
        p.where = () => Promise.resolve(rows);
        return p;
      },
    }),
    insert: () => ({
      values: async (batch: Record<string, unknown>[]) => {
        inserted.push(...batch);
      },
    }),
  };
  return { db, inserted };
}

const row = (over: Partial<ParrainageRow>): ParrainageRow => ({
  civilite: 'M.',
  nom: 'ROBIN',
  prenom: 'François',
  mandat: 'Maire',
  circonscription: 'Le Thoult-Trosnay',
  departement: 'Marne',
  candidat: 'MACRON Emmanuel',
  datePublication: '2022-02-03',
  ...over,
});

describe('upsertSponsorships', () => {
  it('insère deux élus homonymes de communes différentes', async () => {
    const { upsertSponsorships } = await import('./sponsorships.js');
    const { db, inserted } = fakeDb([], []);
    const res = await upsertSponsorships(
      db as never,
      [
        row({}),
        row({
          mandat: 'Conseiller départemental',
          circonscription: '',
          departement: 'Lozère',
          candidat: 'HIDALGO Anne',
        }),
      ],
      2022,
    );
    expect(res.created).toBe(2);
    expect(inserted).toHaveLength(2);
  });

  it('écarte une ligne déjà enregistrée et complète seulement la manquante', async () => {
    const { upsertSponsorships } = await import('./sponsorships.js');
    const existing: Existing[] = [
      {
        rawElectedName: 'ROBIN François',
        rawFunction: 'Maire',
        rawCircumscription: 'Le Thoult-Trosnay',
        rawDepartment: 'Marne',
        candidateName: 'MACRON Emmanuel',
      },
    ];
    const { db, inserted } = fakeDb([], existing);
    const res = await upsertSponsorships(
      db as never,
      [
        row({}),
        row({
          mandat: 'Conseiller départemental',
          circonscription: '',
          departement: 'Lozère',
          candidat: 'HIDALGO Anne',
        }),
      ],
      2022,
    );
    expect(res.created).toBe(1);
    expect(res.updated).toBe(1);
    expect(inserted[0]).toMatchObject({ rawDepartment: 'Lozère' });
  });

  it('ne rattache pas un nom présent plusieurs fois, mais rattache un nom unique', async () => {
    const { upsertSponsorships } = await import('./sponsorships.js');
    const officialRows = [
      { id: 'o-robin', firstName: 'François', lastName: 'Robin' },
      { id: 'o-dupont', firstName: 'Jean', lastName: 'Dupont' },
    ];
    const { db, inserted } = fakeDb(officialRows, []);
    const res = await upsertSponsorships(
      db as never,
      [
        row({}),
        row({ departement: 'Lozère', circonscription: '', mandat: 'Député' }),
        row({ nom: 'DUPONT', prenom: 'Jean', circonscription: 'X' }),
      ],
      2022,
    );
    expect(res.matched).toBe(1);
    const byName = Object.fromEntries(
      inserted.map((r) => [
        `${r.rawElectedName}|${r.rawFunction}`,
        r.officialId,
      ]),
    );
    expect(byName['ROBIN François|Maire']).toBeNull();
    expect(byName['ROBIN François|Député']).toBeNull();
    expect(byName['DUPONT Jean|Maire']).toBe('o-dupont');
  });
});
