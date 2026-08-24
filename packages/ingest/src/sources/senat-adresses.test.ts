import { describe, it, expect, vi } from 'vitest';
import { fetchSenatAdresses } from './senat-adresses.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockFetch(data: unknown[]): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  }) as unknown as typeof fetch;
}

describe('Sénat adresses client', () => {
  it('returns assembly_office for active senators with email', async () => {
    const result = await fetchSenatAdresses(
      mockFetch([
        {
          Matricule: '14001A',
          Etat: 'ACTIF',
          Courrier_electronique: 'j.dupont@senat.fr',
        },
      ]),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      matricule: '14001A',
      type: 'assembly_office',
      street: '15 rue de Vaugirard',
      postal_code: '75291',
      city: 'Paris Cedex 06',
      phone: '+33 1 42 34 20 00',
      email: 'j.dupont@senat.fr',
    });
  });

  it('skips inactive senators', async () => {
    const result = await fetchSenatAdresses(
      mockFetch([
        {
          Matricule: '83008P',
          Etat: 'ANCIEN',
          Courrier_electronique: null,
        },
      ]),
    );

    expect(result).toHaveLength(0);
  });

  it('handles null email', async () => {
    const result = await fetchSenatAdresses(
      mockFetch([
        {
          Matricule: '14001A',
          Etat: 'ACTIF',
          Courrier_electronique: null,
        },
      ]),
    );

    expect(result).toHaveLength(1);
    expect(result[0].email).toBeUndefined();
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;

    await expect(fetchSenatAdresses(fakeFetch)).rejects.toThrow(
      'Sénat adresses error: 500',
    );
  });
});
