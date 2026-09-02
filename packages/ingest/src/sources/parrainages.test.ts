import { describe, it, expect, vi } from 'vitest';
import { fetchParrainages, type ParrainageElection } from './parrainages.js';

const CSV_2022 = `Civilité;Nom;Prénom;Mandat;Circonscription;Département;Candidat;"Date de publication"
M.;CORDIVAL;Gilles;Maire;Mont-Saint-Père;Aisne;"ARTHAUD Nathalie";01/02/2022
Mme;VALLIET;Odile;Maire;Crupilly;Aisne;"ARTHAUD Nathalie";01/02/2022
M.;DUPONT;Jean;Député;;Seine-Saint-Denis;"MACRON Emmanuel";08/02/2022`;

const ELECTION_2022: ParrainageElection = {
  year: 2022,
  url: 'https://example.com/parrainages2022.csv',
  candidateColumn: 'Candidat',
};

describe('fetchParrainages', () => {
  it('parses CSV rows correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(CSV_2022),
    });

    const rows = await fetchParrainages(ELECTION_2022, mockFetch as never);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      civilite: 'M.',
      nom: 'CORDIVAL',
      prenom: 'Gilles',
      mandat: 'Maire',
      circonscription: 'Mont-Saint-Père',
      departement: 'Aisne',
      candidat: 'ARTHAUD Nathalie',
      datePublication: '2022-02-01',
    });
    expect(rows[2].candidat).toBe('MACRON Emmanuel');
    expect(rows[2].mandat).toBe('Député');
  });

  it('skips empty lines', async () => {
    const csv = `Civilité;Nom;Prénom;Mandat;Circonscription;Département;Candidat;"Date de publication"
M.;TEST;Jean;Maire;Ville;Dept;"X Y";01/01/2022

`;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(csv),
    });

    const rows = await fetchParrainages(ELECTION_2022, mockFetch as never);
    expect(rows).toHaveLength(1);
  });

  it('throws on fetch error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(
      fetchParrainages(ELECTION_2022, mockFetch as never),
    ).rejects.toThrow('Parrainages fetch error: 404 Not Found');
  });
});
