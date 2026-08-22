import { describe, it, expect, vi } from 'vitest';
import { fetchDeclarations, InterestItemSchema } from './hatvp.js';

const mockResponse = {
  declarations: [
    {
      id_an: 'PA100001',
      interests: [
        {
          type: 'company_share',
          entity_name: 'Acme Corp',
          role_description: 'Actionnaire minoritaire',
          declared_date: '2023-06-01',
        },
        {
          type: 'nonprofit_role',
          entity_name: 'Association Citoyenne',
          declared_date: '2023-06-01',
        },
      ],
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

describe('HATVP client', () => {
  it('fetches and parses declarations', async () => {
    const fakeFetch = mockFetch(mockResponse);
    const declarations = await fetchDeclarations(fakeFetch);
    expect(declarations).toHaveLength(1);
    expect(declarations[0].interests).toHaveLength(2);
    expect(declarations[0].interests[0].entity_name).toBe('Acme Corp');
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = mockFetch({}, 500);
    await expect(fetchDeclarations(fakeFetch)).rejects.toThrow(
      'HATVP API error: 500',
    );
  });

  it('validates InterestItemSchema', () => {
    expect(
      InterestItemSchema.safeParse(mockResponse.declarations[0].interests[0])
        .success,
    ).toBe(true);
  });

  it('rejects invalid type', () => {
    expect(
      InterestItemSchema.safeParse({
        type: 'invalid',
        entity_name: 'X',
        declared_date: '2023-01-01',
      }).success,
    ).toBe(false);
  });
});
