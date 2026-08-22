import { describe, it, expect, vi } from 'vitest';
import {
  fetchAffiliations,
  AffiliationSchema,
} from './nosdeputes-affiliations.js';

const mockResponse = {
  deputes: [
    {
      depute: {
        slug: 'marie-dupont',
        id_an: 'PA100001',
        groupe_sigle: 'RE',
        parti_ratt_financier: 'Renaissance',
      },
    },
    {
      depute: {
        slug: 'jean-martin',
        id_an: 'PA100002',
        groupe_sigle: 'LFI-NUPES',
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

describe('NosDéputés affiliations client', () => {
  it('fetches and parses affiliations', async () => {
    const fakeFetch = mockFetch(mockResponse);
    const result = await fetchAffiliations(fakeFetch);
    expect(result).toHaveLength(2);
    expect(result[0].groupe_sigle).toBe('RE');
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = mockFetch({}, 500);
    await expect(fetchAffiliations(fakeFetch)).rejects.toThrow('500');
  });

  it('validates schema', () => {
    expect(
      AffiliationSchema.safeParse(mockResponse.deputes[0].depute).success,
    ).toBe(true);
  });

  it('rejects invalid data', () => {
    expect(AffiliationSchema.safeParse({}).success).toBe(false);
  });
});
