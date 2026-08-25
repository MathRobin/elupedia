import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { fetchSenatElections } from './senat-elections.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function buildXlsx(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, data] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out;
}

function mockFetch(buffer: ArrayBuffer): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(buffer),
  }) as unknown as typeof fetch;
}

describe('Sénat elections client', () => {
  it('parses majority T1 sheet with elected candidates', async () => {
    const buf = buildXlsx({
      'MAJ - T1': [
        [
          'Code localisation',
          'Libellé localisation',
          'Code département',
          'Libellé département',
          'Code commune',
          'Libellé commune',
          'Code BV',
          'Inscrits',
          'Votants',
          '% Votants',
          'Abstentions',
          '% Abstentions',
          'Exprimés',
          '% Exprimés/inscrits',
          '% Exprimés/votants',
          'Blancs',
          '% Blancs/inscrits',
          '% Blancs/votants',
          'Nuls',
          '% Nuls/inscrits',
          '% Nuls/votants',
          'Nuance candidat 1',
          'Nom candidat 1',
          'Prénom candidat 1',
          'Sexe candidat 1',
          'Nuance liste 1',
          'Libellé abrégé de liste 1',
          'Libellé de liste 1',
          'Voix 1',
          '% Voix/inscrits 1',
          '% Voix/exprimés 1',
          'Elu 1',
          'Sièges 1',
          'Nuance candidat 2',
          'Nom candidat 2',
          'Prénom candidat 2',
          'Sexe candidat 2',
          'Nuance liste 2',
          'Libellé abrégé de liste 2',
          'Libellé de liste 2',
          'Voix 2',
          '% Voix/inscrits 2',
          '% Voix/exprimés 2',
          'Elu 2',
          'Sièges 2',
        ],
        [
          'FE',
          'France',
          '39',
          'Jura',
          '39300',
          'Lons',
          '1',
          998,
          979,
          '98,10%',
          19,
          '1,90%',
          958,
          '95,99%',
          '97,85%',
          13,
          '1,30%',
          '1,33%',
          8,
          '0,80%',
          '0,82%',
          'UDI',
          'DUPONT',
          'Marie',
          'F',
          '',
          '',
          '',
          573,
          '76,50%',
          '79,14%',
          'élu',
          '',
          'LR',
          'MARTIN',
          'Pierre',
          'M',
          '',
          '',
          '',
          200,
          '20,00%',
          '20,88%',
          '',
          '',
        ],
      ],
    });

    const result = await fetchSenatElections('2023', mockFetch(buf));

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      nom: 'DUPONT',
      prenom: 'Marie',
      electionDate: '2023-09-24',
      round: 1,
      scorePercent: 79.14,
      opponentCount: 1,
    });
  });

  it('parses majority T2 as round 2', async () => {
    const buf = buildXlsx({
      'MAJ - T2': [
        [
          'Code localisation',
          'Libellé localisation',
          'Code département',
          'Libellé département',
          'Code commune',
          'Libellé commune',
          'Code BV',
          'Inscrits',
          'Votants',
          '% Votants',
          'Abstentions',
          '% Abstentions',
          'Exprimés',
          '% Exprimés/inscrits',
          '% Exprimés/votants',
          'Blancs',
          '% Blancs/inscrits',
          '% Blancs/votants',
          'Nuls',
          '% Nuls/inscrits',
          '% Nuls/votants',
          'Nuance candidat 1',
          'Nom candidat 1',
          'Prénom candidat 1',
          'Sexe candidat 1',
          'Nuance liste 1',
          'Libellé abrégé de liste 1',
          'Libellé de liste 1',
          'Voix 1',
          '% Voix/inscrits 1',
          '% Voix/exprimés 1',
          'Elu 1',
          'Sièges 1',
        ],
        [
          'FE',
          'France',
          '52',
          'Haute-Marne',
          '52121',
          'Chaumont',
          '1',
          100,
          98,
          '98%',
          2,
          '2%',
          95,
          '95%',
          '96,94%',
          1,
          '1%',
          '1,02%',
          2,
          '2%',
          '2,04%',
          'LR',
          'SIDO',
          'Bruno',
          'M',
          '',
          '',
          '',
          60,
          '60%',
          '63,16%',
          'élu',
          '',
        ],
      ],
    });

    const result = await fetchSenatElections('2023', mockFetch(buf));

    expect(result).toHaveLength(1);
    expect(result[0].round).toBe(2);
    expect(result[0].nom).toBe('SIDO');
  });

  it('throws on unknown year', async () => {
    await expect(fetchSenatElections('1900')).rejects.toThrow(
      'No election data configured for year 1900',
    );
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;

    await expect(fetchSenatElections('2023', fakeFetch)).rejects.toThrow(
      'Sénat elections 2023 error: 500',
    );
  });
});
