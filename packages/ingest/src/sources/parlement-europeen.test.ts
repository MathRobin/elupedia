import { describe, it, expect, vi } from 'vitest';
import {
  fetchCurrentFrenchMeps,
  fetchMepDetail,
  fetchOrganizationLabel,
} from './parlement-europeen.js';

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

describe('fetchCurrentFrenchMeps', () => {
  it('filters to French MEPs only', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'person/1',
            identifier: '1',
            familyName: 'Toussaint',
            givenName: 'Marie',
            'api:country-of-representation': 'FR',
            'api:political-group': 'Verts/ALE',
          },
          {
            id: 'person/2',
            identifier: '2',
            familyName: 'Bocheński',
            givenName: 'Tobiasz',
            'api:country-of-representation': 'PL',
            'api:political-group': 'ECR',
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await fetchCurrentFrenchMeps(fetchFn);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: '1',
      familyName: 'Toussaint',
      givenName: 'Marie',
      politicalGroup: 'Verts/ALE',
    });
  });

  it('throws on HTTP error', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    await expect(fetchCurrentFrenchMeps(fetchFn)).rejects.toThrow(
      '/meps/show-current error: 503',
    );
  });
});

describe('fetchMepDetail', () => {
  const detailPayload = {
    data: [
      {
        identifier: '97236',
        bday: '1987-05-27',
        hasMembership: [
          {
            organization: 'org/ep-10',
            role: 'def/ep-roles/MEMBER_PARLIAMENT',
            memberDuring: { startDate: '2024-07-16' },
          },
          {
            organization: 'org/ep-9',
            role: 'def/ep-roles/MEMBER_PARLIAMENT',
            memberDuring: { startDate: '2019-07-02', endDate: '2024-07-15' },
          },
          {
            organization: 'org/6727',
            membershipClassification:
              'def/ep-entities/NATIONAL_POLITICAL_GROUP',
            memberDuring: { startDate: '2024-07-16' },
          },
        ],
      },
    ],
  };

  it('extracts birth date, current parliamentary mandate and national party', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(detailPayload),
      ) as unknown as typeof fetch;

    const result = await fetchMepDetail(fetchFn, '97236');

    expect(result.birthDate).toBe('1987-05-27');
    expect(result.currentParliamentaryMandate).toEqual({
      startDate: '2024-07-16',
      endDate: null,
    });
    expect(result.currentNationalPartyOrgId).toBe('org/6727');
    expect(result.currentNationalPartyStartDate).toBe('2024-07-16');
  });

  it('returns null mandate when not a member of the current legislature', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ identifier: '1', hasMembership: [] }],
      }),
    ) as unknown as typeof fetch;

    const result = await fetchMepDetail(fetchFn, '1');
    expect(result.currentParliamentaryMandate).toBeNull();
    expect(result.currentNationalPartyOrgId).toBeNull();
  });

  it('tolerates a membership without an organization field', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            identifier: '256908',
            bday: '1968-06-11',
            hasMembership: [
              { role: 'def/ep-roles/CHAIR_VICE' },
              {
                organization: 'org/ep-10',
                role: 'def/ep-roles/MEMBER_PARLIAMENT',
                memberDuring: { startDate: '2024-07-16' },
              },
            ],
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await fetchMepDetail(fetchFn, '256908');
    expect(result.currentParliamentaryMandate).toEqual({
      startDate: '2024-07-16',
      endDate: null,
    });
  });

  it('ignores a national party membership that has already ended', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            identifier: '1',
            hasMembership: [
              {
                organization: 'org/111',
                membershipClassification:
                  'def/ep-entities/NATIONAL_POLITICAL_GROUP',
                memberDuring: {
                  startDate: '2010-01-01',
                  endDate: '2015-01-01',
                },
              },
            ],
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await fetchMepDetail(fetchFn, '1');
    expect(result.currentNationalPartyOrgId).toBeNull();
  });
});

describe('fetchOrganizationLabel', () => {
  it('resolves the organization label', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: [{ id: 'org/6727', label: 'Europe Écologie' }] }),
      ) as unknown as typeof fetch;

    const label = await fetchOrganizationLabel(fetchFn, 'org/6727');
    expect(label).toBe('Europe Écologie');
  });

  it('returns null on HTTP error instead of throwing', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
    const label = await fetchOrganizationLabel(fetchFn, 'org/999999');
    expect(label).toBeNull();
  });
});
