import { describe, it, expect, vi } from 'vitest';
import { fetchAddresses, AddressSchema } from './an-adresses.js';

const mockResponse = {
  deputes: [
    {
      id_an: 'PA100001',
      type: 'constituency_office',
      street: '12 rue de la Mairie',
      postal_code: '33000',
      city: 'Bordeaux',
      phone: '05 56 00 00 00',
      email: 'depute@assemblee-nationale.fr',
    },
    {
      id_an: 'PA100002',
      type: 'assembly_office',
      city: 'Paris',
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

describe('AN adresses client', () => {
  it('fetches and parses addresses', async () => {
    const fakeFetch = mockFetch(mockResponse);
    const result = await fetchAddresses(fakeFetch);
    expect(result).toHaveLength(2);
    expect(result[0].city).toBe('Bordeaux');
    expect(result[0].email).toBe('depute@assemblee-nationale.fr');
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = mockFetch({}, 500);
    await expect(fetchAddresses(fakeFetch)).rejects.toThrow(
      'AN adresses API error: 500',
    );
  });

  it('validates AddressSchema', () => {
    expect(AddressSchema.safeParse(mockResponse.deputes[0]).success).toBe(true);
  });

  it('rejects invalid type', () => {
    expect(
      AddressSchema.safeParse({
        id_an: 'PA100001',
        type: 'invalid_type',
      }).success,
    ).toBe(false);
  });
});
