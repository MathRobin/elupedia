import { describe, it, expect, vi } from 'vitest';
import {
  fetchCollaborateurs,
  CollaborateurSchema,
  CollaborateursResponseSchema,
} from './an-collaborateurs.js';

const mockResponse = {
  deputes: [
    {
      id_an: 'PA100001',
      collaborateurs: [
        { prenom: 'Alice', nom: 'Bernard', id_an: 'C001' },
        { prenom: 'Bob', nom: 'Charrier', id_an: 'C002' },
      ],
    },
    {
      id_an: 'PA100002',
      collaborateurs: [{ prenom: 'Claire', nom: 'Duval', id_an: 'C003' }],
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

describe('AN collaborateurs client', () => {
  it('fetches and parses collaborateurs', async () => {
    const fakeFetch = mockFetch(mockResponse);
    const deputes = await fetchCollaborateurs(fakeFetch);

    expect(deputes).toHaveLength(2);
    expect(deputes[0].collaborateurs).toHaveLength(2);
    expect(deputes[0].collaborateurs[0].prenom).toBe('Alice');
    expect(deputes[1].id_an).toBe('PA100002');
  });

  it('calls the correct URL', async () => {
    const fakeFetch = mockFetch(mockResponse);
    await fetchCollaborateurs(fakeFetch);

    expect(fakeFetch).toHaveBeenCalledWith(
      'https://data.assemblee-nationale.fr/api/collaborateurs/json',
    );
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = mockFetch({}, 500);
    await expect(fetchCollaborateurs(fakeFetch)).rejects.toThrow(
      'AN collaborateurs API error: 500',
    );
  });

  it('throws on invalid response', async () => {
    const fakeFetch = mockFetch({ invalid: true });
    await expect(fetchCollaborateurs(fakeFetch)).rejects.toThrow();
  });
});

describe('Zod schemas', () => {
  it('CollaborateurSchema validates a valid collaborateur', () => {
    const result = CollaborateurSchema.safeParse(
      mockResponse.deputes[0].collaborateurs[0],
    );
    expect(result.success).toBe(true);
  });

  it('CollaborateurSchema rejects missing fields', () => {
    const result = CollaborateurSchema.safeParse({ prenom: 'Alice' });
    expect(result.success).toBe(false);
  });

  it('CollaborateursResponseSchema validates full response', () => {
    const result = CollaborateursResponseSchema.safeParse(mockResponse);
    expect(result.success).toBe(true);
  });
});
