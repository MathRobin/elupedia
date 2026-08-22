import { describe, it, expect, vi } from 'vitest';
import { fetchActivities, ActivityItemSchema } from './an-activite.js';

const mockResponse = {
  deputes: [
    {
      id_an: 'PA100001',
      activities: [
        {
          type: 'written_question',
          title: 'Question sur le logement social',
          date: '2024-03-15',
        },
        {
          type: 'amendment',
          title: 'Amendement n°42 au PLF 2024',
          date: '2024-02-10',
          status: 'adopted',
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

describe('AN activité client', () => {
  it('fetches and parses activities', async () => {
    const fakeFetch = mockFetch(mockResponse);
    const result = await fetchActivities(fakeFetch);
    expect(result).toHaveLength(1);
    expect(result[0].activities).toHaveLength(2);
    expect(result[0].activities[0].title).toBe(
      'Question sur le logement social',
    );
    expect(result[0].activities[1].status).toBe('adopted');
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = mockFetch({}, 500);
    await expect(fetchActivities(fakeFetch)).rejects.toThrow(
      'AN activité API error: 500',
    );
  });

  it('validates ActivityItemSchema', () => {
    expect(
      ActivityItemSchema.safeParse(mockResponse.deputes[0].activities[0])
        .success,
    ).toBe(true);
  });

  it('rejects invalid type', () => {
    expect(
      ActivityItemSchema.safeParse({
        type: 'debate',
        title: 'Test',
        date: '2024-01-01',
      }).success,
    ).toBe(false);
  });
});
