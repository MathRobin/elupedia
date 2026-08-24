import { describe, it, expect, vi } from 'vitest';
import { fetchSenateurs, GENERAL_URL, MANDATS_URL } from './senat.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockFetch(generalData: unknown[], mandatsData: unknown[]): typeof fetch {
  return vi.fn((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr === GENERAL_URL) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(generalData),
      });
    }
    if (urlStr === MANDATS_URL) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mandatsData),
      });
    }
    return Promise.resolve({ ok: false, status: 404 });
  }) as unknown as typeof fetch;
}

const sampleGeneral = {
  Matricule: '14001A',
  Qualite: 'M.',
  Nom_usuel: 'Dupont',
  Prenom_usuel: 'Jean',
  Etat: 'ACTIF',
  Date_naissance: '1960/03/15 00:00:00',
  Date_de_deces: null,
  Groupe_politique: 'SOC',
  Circonscription: 'Gironde',
  Courrier_electronique: 'j.dupont@senat.fr',
};

const sampleMandat1 = {
  Matricule: '14001A',
  Date_de_debut_de_mandat: '2014/10/01 00:00:00',
  Date_de_fin_de_mandat: '2020/09/30 00:00:00',
  Motif_debut_de_mandat: 'Election',
  Motif_fin_de_mandat: 'Fin de mandat',
};

const sampleMandat2 = {
  Matricule: '14001A',
  Date_de_debut_de_mandat: '2020/10/01 00:00:00',
  Date_de_fin_de_mandat: null,
  Motif_debut_de_mandat: 'Renouvellement',
  Motif_fin_de_mandat: null,
};

describe('Sénat client', () => {
  it('parses senators with their mandates', async () => {
    const result = await fetchSenateurs(
      mockFetch([sampleGeneral], [sampleMandat1, sampleMandat2]),
    );

    expect(result).toHaveLength(1);
    expect(result[0].matricule).toBe('14001A');
    expect(result[0].nom).toBe('Dupont');
    expect(result[0].prenom).toBe('Jean');
    expect(result[0].sexe).toBe('M');
    expect(result[0].date_naissance).toBe('1960-03-15');
    expect(result[0].slug).toBe('jean-dupont');
    expect(result[0].mandats).toHaveLength(2);
    expect(result[0].mandats[0].start_date).toBe('2014-10-01');
    expect(result[0].mandats[0].end_date).toBe('2020-09-30');
    expect(result[0].mandats[1].start_date).toBe('2020-10-01');
    expect(result[0].mandats[1].end_date).toBeNull();
  });

  it('handles female senators', async () => {
    const femaleGeneral = { ...sampleGeneral, Qualite: 'Mme', Matricule: '14002B' };
    const result = await fetchSenateurs(mockFetch([femaleGeneral], []));
    expect(result[0].sexe).toBe('F');
    expect(result[0].mandats).toHaveLength(0);
  });

  it('stores full raw data', async () => {
    const result = await fetchSenateurs(mockFetch([sampleGeneral], []));
    expect(result[0].full).toEqual(sampleGeneral);
  });

  it('throws on HTTP error for general', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;
    await expect(fetchSenateurs(fakeFetch)).rejects.toThrow('Sénat GENERAL error: 500');
  });

  it('skips mandates without start date', async () => {
    const badMandat = {
      Matricule: '14001A',
      Date_de_debut_de_mandat: null,
      Date_de_fin_de_mandat: null,
      Motif_debut_de_mandat: null,
      Motif_fin_de_mandat: null,
    };
    const result = await fetchSenateurs(mockFetch([sampleGeneral], [badMandat]));
    expect(result[0].mandats).toHaveLength(0);
  });
});
