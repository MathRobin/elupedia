import { describe, it, expect, vi } from 'vitest';
import { fetchSenatCommissions } from './senat-commissions.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockFetch(
  commissionsRows: Record<string, string>[],
  offdelRows: Record<string, string>[],
): typeof fetch {
  return vi.fn().mockImplementation((url: string) => {
    const isOffdel = url.includes('OFFDEL');
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({ results: isOffdel ? offdelRows : commissionsRows }),
    });
  }) as unknown as typeof fetch;
}

describe('fetchSenatCommissions', () => {
  it('parses commissions from ODSEN_COMS.json', async () => {
    const rows = [
      {
        Matricule: '11072N',
        Qualite: 'M.',
        Nom_usuel: 'Mohamed Soilihi',
        Prenom_usuel: 'Thani',
        Etat_Senateur: 'ACTUEL',
        Nom_commission: 'commission des lois',
        Type_commission: 'Commission permanente',
        Id_d_appartenance: '1234',
        Debut_d_appartenance: '2020/10/01 00:00:00',
        Fin_d_appartenance: '',
        Id_de_fonction: '5678',
        Debut_de_fonction: '2020/10/01 00:00:00',
        Fin_de_fonction: '',
        Fonction: ' ',
      },
    ];

    const result = await fetchSenatCommissions(mockFetch(rows, []));
    expect(result).toHaveLength(1);
    expect(result[0].matricule).toBe('11072N');
    expect(result[0].committees).toHaveLength(1);
    expect(result[0].committees[0]).toMatchObject({
      name: 'commission des lois',
      type: 'standing_committee',
      start_date: '2020-10-01',
    });
    expect(result[0].committees[0].end_date).toBeUndefined();
  });

  it('parses delegations from ODSEN_OFFDEL.json', async () => {
    const rows = [
      {
        Matricule: '14263U',
        Qualite: 'M.',
        Nom_usuel: 'Abate',
        Prenom_usuel: 'Patrick',
        Etat_Senateur: 'ANCIEN',
        Nom_organisme: 'Office parlementaire des choix scientifiques',
        Type_commission: 'Office parlementaire',
        Id_d_appartenance: '4808',
        Debut_d_appartenance: '2015/02/20 00:00:00',
        Fin_d_appartenance: '2017/06/17 00:00:00',
        Id_de_fonction: '9999',
        Debut_de_fonction: '2015/02/20 00:00:00',
        Fin_de_fonction: '2017/06/17 00:00:00',
        Fonction: ' ',
      },
    ];

    const result = await fetchSenatCommissions(mockFetch([], rows));
    expect(result).toHaveLength(1);
    expect(result[0].committees[0]).toMatchObject({
      name: 'Office parlementaire des choix scientifiques',
      type: 'delegation',
      start_date: '2015-02-20',
      end_date: '2017-06-17',
    });
  });

  it('merges commissions and delegations for same senator', async () => {
    const coms = [
      {
        Matricule: '11072N',
        Nom_commission: 'commission des lois',
        Type_commission: 'Commission permanente',
        Debut_d_appartenance: '2020/10/01 00:00:00',
        Fin_d_appartenance: '',
      },
    ];
    const offdel = [
      {
        Matricule: '11072N',
        Nom_organisme: 'Délégation sénatoriale',
        Type_commission: 'Délégation',
        Debut_d_appartenance: '2021/01/15 00:00:00',
        Fin_d_appartenance: '',
      },
    ];

    const result = await fetchSenatCommissions(
      mockFetch(
        coms as Record<string, string>[],
        offdel as Record<string, string>[],
      ),
    );
    expect(result).toHaveLength(1);
    expect(result[0].committees).toHaveLength(2);
  });

  it('throws on HTTP error', async () => {
    const failFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }) as unknown as typeof fetch;

    await expect(fetchSenatCommissions(failFetch)).rejects.toThrow(
      'Sénat commissions API error',
    );
  });

  it('skips rows without start date', async () => {
    const rows = [
      {
        Matricule: '11072N',
        Nom_commission: 'commission X',
        Type_commission: 'Commission permanente',
        Debut_d_appartenance: '',
        Fin_d_appartenance: '',
      },
    ];
    const result = await fetchSenatCommissions(mockFetch(rows, []));
    expect(result).toHaveLength(0);
  });
});
