import { describe, it, expect, vi } from 'vitest';
import { fetchCommittees, CommitteeItemSchema } from './an-commissions.js';

const mockResponse = {
  deputes: [
    {
      id_an: 'PA100001',
      committees: [
        {
          name: 'Commission des finances',
          type: 'standing_committee',
          start_date: '2022-07-01',
        },
        {
          name: "Groupe d'amitié France-Japon",
          type: 'friendship_group',
          start_date: '2023-01-15',
          end_date: '2024-06-30',
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

describe('AN commissions client', () => {
  it('fetches and parses committees', async () => {
    const fakeFetch = mockFetch(mockResponse);
    const result = await fetchCommittees(fakeFetch);
    expect(result).toHaveLength(1);
    expect(result[0].committees).toHaveLength(2);
    expect(result[0].committees[0].name).toBe('Commission des finances');
    expect(result[0].committees[1].end_date).toBe('2024-06-30');
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = mockFetch({}, 500);
    await expect(fetchCommittees(fakeFetch)).rejects.toThrow(
      'AN commissions API error: 500',
    );
  });

  it('validates CommitteeItemSchema', () => {
    expect(
      CommitteeItemSchema.safeParse(mockResponse.deputes[0].committees[0])
        .success,
    ).toBe(true);
  });

  it('rejects invalid type', () => {
    expect(
      CommitteeItemSchema.safeParse({
        name: 'Test',
        type: 'invalid_committee',
        start_date: '2024-01-01',
      }).success,
    ).toBe(false);
  });
});
