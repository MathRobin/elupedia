import { describe, it, expect, vi } from 'vitest';
import {
  fetchElectionResults,
  ElectionResultSchema,
} from './datagouv-elections.js';

const mockResponse = {
  results: [
    {
      id_an: 'PA100001',
      election_type: 'legislatives',
      election_date: '2022-06-19',
      round: 2,
      score_percent: 54.3,
      opponent_count: 1,
    },
    {
      id_an: 'PA100001',
      election_type: 'legislatives',
      election_date: '2022-06-12',
      round: 1,
      score_percent: 32.1,
      opponent_count: 8,
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

describe('data.gouv.fr elections client', () => {
  it('fetches and parses election results', async () => {
    const fakeFetch = mockFetch(mockResponse);
    const result = await fetchElectionResults(fakeFetch);
    expect(result).toHaveLength(2);
    expect(result[0].score_percent).toBe(54.3);
    expect(result[0].round).toBe(2);
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = mockFetch({}, 500);
    await expect(fetchElectionResults(fakeFetch)).rejects.toThrow(
      'data.gouv.fr elections API error: 500',
    );
  });

  it('validates ElectionResultSchema', () => {
    expect(
      ElectionResultSchema.safeParse(mockResponse.results[0]).success,
    ).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(
      ElectionResultSchema.safeParse({
        id_an: 'PA100001',
        election_type: 'legislatives',
      }).success,
    ).toBe(false);
  });
});
