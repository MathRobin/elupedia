import { describe, it, expect, vi } from 'vitest';
import { fetchSenatGroupes } from './senat-groupes.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockFetch(data: unknown[]): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  }) as unknown as typeof fetch;
}

const sampleRecord = {
  Matricule: '14001A',
  Id_appartenance: 1,
  Id_fonction_occupee: 1,
  Nom: 'Dupont',
  Prenom: 'Jean',
  Code_du_groupe_politique: 'SOC',
  Nom_court_du_groupe_politique: 'Groupe Socialiste',
  Date_de_debut_d_appartenance: '2014/10/01 00:00:00',
  Date_de_fin_d_appartenance: '2020/09/30 00:00:00',
  Nom_court_fonction: 'Membre',
  Date_de_debut_de_la_fonction: '2014/10/01 00:00:00',
  Date_de_fin_de_la_fonction: '2020/09/30 00:00:00',
};

describe('Sénat groupes client', () => {
  it('parses affiliations with dates', async () => {
    const result = await fetchSenatGroupes(mockFetch([sampleRecord]));
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      matricule: '14001A',
      group_name: 'Groupe Socialiste',
      start_date: '2014-10-01',
      end_date: '2020-09-30',
    });
  });

  it('handles null dates', async () => {
    const record = {
      ...sampleRecord,
      Date_de_debut_d_appartenance: null,
      Date_de_fin_d_appartenance: null,
    };
    const result = await fetchSenatGroupes(mockFetch([record]));
    expect(result[0].start_date).toBeNull();
    expect(result[0].end_date).toBeNull();
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;
    await expect(fetchSenatGroupes(fakeFetch)).rejects.toThrow(
      'Sénat groupes error: 500',
    );
  });
});
