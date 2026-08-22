import { describe, it, expect, vi } from 'vitest';
import {
  fetchDeputes,
  DeputeSchema,
  DeputesResponseSchema,
} from './nosdeputes.js';

const mockDeputesResponse = {
  deputes: [
    {
      depute: {
        id: 1,
        nom: 'Dupont',
        prenom: 'Marie',
        sexe: 'F',
        date_naissance: '1975-03-14',
        lieu_naissance: 'Bordeaux',
        num_deptmt: '33',
        nom_circo: 'Gironde',
        num_circo: 3,
        mandat_debut: '2022-06-19',
        groupe_sigle: 'RE',
        slug: 'marie-dupont',
        id_an: 'PA100001',
        photo_url: 'https://example.com/photo.jpg',
      },
    },
    {
      depute: {
        id: 2,
        nom: 'Martin',
        prenom: 'Jean',
        sexe: 'H',
        date_naissance: '1968-11-22',
        num_deptmt: '75',
        nom_circo: 'Paris',
        num_circo: 1,
        mandat_debut: '2022-06-19',
        groupe_sigle: 'LFI-NUPES',
        slug: 'jean-martin',
        id_an: 'PA100002',
      },
    },
  ],
};

function mockFetch(data: unknown, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Internal Server Error',
    json: () => Promise.resolve(data),
  }) as unknown as typeof fetch;
}

describe('NosDéputés client', () => {
  it('fetches and parses deputies', async () => {
    const fakeFetch = mockFetch(mockDeputesResponse);
    const deputes = await fetchDeputes(fakeFetch);

    expect(deputes).toHaveLength(2);
    expect(deputes[0].nom).toBe('Dupont');
    expect(deputes[0].prenom).toBe('Marie');
    expect(deputes[0].num_deptmt).toBe('33');
    expect(deputes[1].id_an).toBe('PA100002');
  });

  it('calls the correct URL', async () => {
    const fakeFetch = mockFetch(mockDeputesResponse);
    await fetchDeputes(fakeFetch);

    expect(fakeFetch).toHaveBeenCalledWith(
      'https://www.nosdeputes.fr/deputes/enmandat/json',
    );
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = mockFetch({}, 500);
    await expect(fetchDeputes(fakeFetch)).rejects.toThrow(
      'NosDéputés API error: 500',
    );
  });

  it('throws on invalid response shape', async () => {
    const fakeFetch = mockFetch({ invalid: true });
    await expect(fetchDeputes(fakeFetch)).rejects.toThrow();
  });
});

describe('Zod schemas', () => {
  it('DeputeSchema validates a valid depute', () => {
    const result = DeputeSchema.safeParse(
      mockDeputesResponse.deputes[0].depute,
    );
    expect(result.success).toBe(true);
  });

  it('DeputeSchema rejects missing required fields', () => {
    const result = DeputeSchema.safeParse({ id: 1 });
    expect(result.success).toBe(false);
  });

  it('DeputesResponseSchema validates full response', () => {
    const result = DeputesResponseSchema.safeParse(mockDeputesResponse);
    expect(result.success).toBe(true);
  });
});
