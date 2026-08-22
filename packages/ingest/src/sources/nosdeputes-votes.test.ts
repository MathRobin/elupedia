import { describe, it, expect, vi } from 'vitest';
import { fetchVotesForDepute, VoteDetailSchema } from './nosdeputes-votes.js';

const mockVotesResponse = {
  votes: [
    {
      vote: {
        scrutin_id: 4242,
        scrutin_titre: 'Projet de loi de finances 2024',
        scrutin_date: '2023-12-15',
        scrutin_type: 'solennel',
        position: 'pour',
      },
    },
    {
      vote: {
        scrutin_id: 4243,
        scrutin_titre: 'Motion de censure',
        scrutin_date: '2023-12-20',
        position: 'contre',
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

describe('NosDéputés votes client', () => {
  it('fetches and parses votes for a deputy', async () => {
    const fakeFetch = mockFetch(mockVotesResponse);
    const votes = await fetchVotesForDepute('marie-dupont', fakeFetch);

    expect(votes).toHaveLength(2);
    expect(votes[0].scrutin_titre).toBe('Projet de loi de finances 2024');
    expect(votes[0].position).toBe('pour');
    expect(votes[1].scrutin_id).toBe(4243);
  });

  it('calls the correct URL', async () => {
    const fakeFetch = mockFetch(mockVotesResponse);
    await fetchVotesForDepute('marie-dupont', fakeFetch);

    expect(fakeFetch).toHaveBeenCalledWith(
      'https://www.nosdeputes.fr/marie-dupont/votes/json',
    );
  });

  it('throws on HTTP error', async () => {
    const fakeFetch = mockFetch({}, 500);
    await expect(
      fetchVotesForDepute('marie-dupont', fakeFetch),
    ).rejects.toThrow('NosDéputés votes API error: 500');
  });

  it('throws on invalid response', async () => {
    const fakeFetch = mockFetch({ invalid: true });
    await expect(
      fetchVotesForDepute('marie-dupont', fakeFetch),
    ).rejects.toThrow();
  });
});

describe('Zod schemas', () => {
  it('VoteDetailSchema validates a valid vote', () => {
    const result = VoteDetailSchema.safeParse(mockVotesResponse.votes[0].vote);
    expect(result.success).toBe(true);
  });

  it('VoteDetailSchema rejects missing required fields', () => {
    const result = VoteDetailSchema.safeParse({ scrutin_id: 1 });
    expect(result.success).toBe(false);
  });
});
