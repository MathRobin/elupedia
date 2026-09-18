import { describe, it, expect, vi } from 'vitest';
import {
  fetchPlenarySittings,
  fetchRollcallDecisions,
} from './parlement-europeen-votes.js';

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

describe('fetchPlenarySittings', () => {
  it('parses the sitting list for a year', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { activity_id: 'MTG-PL-2025-01-20', activity_date: '2025-01-20' },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await fetchPlenarySittings(fetchFn, 2025);
    expect(result).toEqual([{ id: 'MTG-PL-2025-01-20', date: '2025-01-20' }]);
  });

  it('throws on HTTP error', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(null, 500)) as unknown as typeof fetch;
    await expect(fetchPlenarySittings(fetchFn, 2025)).rejects.toThrow(
      '/meetings?year=2025 error: 500',
    );
  });
});

describe('fetchRollcallDecisions', () => {
  it('keeps only roll-call votes and maps voter positions by person id', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            activity_id: 'MTG-PL-2025-01-20-DEC-1',
            activity_date: '2025-01-20',
            activity_label: { fr: 'Ordre du jour', en: 'Agenda' },
            decision_method: 'def/ep-decision-methods/VOTE_ELECTRONIC_ROLLCALL',
            had_voter_for: ['person/1', 'person/2'],
            had_voter_against: ['person/3'],
            had_voter_abstention: ['person/4'],
          },
          {
            activity_id: 'MTG-PL-2025-01-20-DEC-2',
            activity_date: '2025-01-20',
            activity_label: { fr: 'Main levée' },
            decision_method: 'def/ep-decision-methods/VOTE_SHOW_OF_HANDS',
            had_voter_for: ['person/1'],
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await fetchRollcallDecisions(fetchFn, 'MTG-PL-2025-01-20');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('MTG-PL-2025-01-20-DEC-1');
    expect(result[0].title).toBe('Ordre du jour');
    expect(result[0].votersByPersonId.get('1')).toBe('for');
    expect(result[0].votersByPersonId.get('2')).toBe('for');
    expect(result[0].votersByPersonId.get('3')).toBe('against');
    expect(result[0].votersByPersonId.get('4')).toBe('abstain');
  });

  it('returns an empty array for a sitting without a decisions endpoint (404)', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(null, 404)) as unknown as typeof fetch;
    const result = await fetchRollcallDecisions(fetchFn, 'MTG-PL-2025-08-01');
    expect(result).toEqual([]);
  });

  it('throws on other HTTP errors', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(null, 500)) as unknown as typeof fetch;
    await expect(
      fetchRollcallDecisions(fetchFn, 'MTG-PL-2025-01-20'),
    ).rejects.toThrow('/decisions error: 500');
  });

  it('falls back to a placeholder title when no label is present', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            activity_id: 'MTG-PL-2025-01-20-DEC-3',
            activity_date: '2025-01-20',
            decision_method: 'def/ep-decision-methods/VOTE_ELECTRONIC_ROLLCALL',
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await fetchRollcallDecisions(fetchFn, 'MTG-PL-2025-01-20');
    expect(result[0].title).toBe('(sans titre)');
    expect(result[0].votersByPersonId.size).toBe(0);
  });
});
