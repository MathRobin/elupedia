import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@elupedia/shared', () => ({
  createDb: vi.fn(() => 'mock-db'),
  officials: {},
  mandates: {},
  ballots: {},
  votes: {},
  staffers: {},
  affiliations: {},
  interests: {},
  addresses: {},
  parliamentaryActivity: {},
  committees: {},
  electoralResults: {},
}));

vi.mock('./utils/retry.js', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock('./sources/nosdeputes.js', () => ({
  fetchDeputes: vi.fn(),
}));
vi.mock('./sources/nosdeputes-votes.js', () => ({
  fetchVotesForDepute: vi.fn(),
}));
vi.mock('./sources/an-collaborateurs.js', () => ({
  fetchCollaborateurs: vi.fn(),
}));
vi.mock('./sources/nosdeputes-affiliations.js', () => ({
  fetchAffiliations: vi.fn(),
}));
vi.mock('./sources/hatvp.js', () => ({
  fetchDeclarations: vi.fn(),
}));
vi.mock('./sources/an-adresses.js', () => ({
  fetchAddresses: vi.fn(),
}));
vi.mock('./sources/an-activite.js', () => ({
  fetchActivities: vi.fn(),
}));
vi.mock('./sources/an-commissions.js', () => ({
  fetchCommittees: vi.fn(),
}));
vi.mock('./sources/datagouv-elections.js', () => ({
  fetchElectionResults: vi.fn(),
}));
vi.mock('./upsert/officials.js', () => ({
  upsertOfficials: vi.fn(),
}));
vi.mock('./upsert/votes.js', () => ({
  upsertVotes: vi.fn(),
}));
vi.mock('./upsert/staffers-diff.js', () => ({
  diffStaffers: vi.fn(),
}));
vi.mock('./upsert/affiliations-diff.js', () => ({
  diffAffiliations: vi.fn(),
}));
vi.mock('./upsert/interests.js', () => ({
  upsertInterests: vi.fn(),
}));
vi.mock('./upsert/addresses.js', () => ({
  upsertAddresses: vi.fn(),
}));
vi.mock('./upsert/parliamentary-activity.js', () => ({
  upsertParliamentaryActivity: vi.fn(),
}));
vi.mock('./upsert/committees.js', () => ({
  upsertCommittees: vi.fn(),
}));
vi.mock('./upsert/electoral-results.js', () => ({
  upsertElectoralResults: vi.fn(),
}));

import { run } from './run.js';
import { fetchDeputes } from './sources/nosdeputes.js';
import { fetchVotesForDepute } from './sources/nosdeputes-votes.js';
import { fetchCollaborateurs } from './sources/an-collaborateurs.js';
import { fetchAffiliations } from './sources/nosdeputes-affiliations.js';
import { fetchDeclarations } from './sources/hatvp.js';
import { fetchAddresses } from './sources/an-adresses.js';
import { fetchActivities } from './sources/an-activite.js';
import { fetchCommittees } from './sources/an-commissions.js';
import { fetchElectionResults } from './sources/datagouv-elections.js';
import { upsertOfficials } from './upsert/officials.js';
import { upsertVotes } from './upsert/votes.js';
import { diffStaffers } from './upsert/staffers-diff.js';
import { diffAffiliations } from './upsert/affiliations-diff.js';
import { upsertInterests } from './upsert/interests.js';
import { upsertAddresses } from './upsert/addresses.js';
import { upsertParliamentaryActivity } from './upsert/parliamentary-activity.js';
import { upsertCommittees } from './upsert/committees.js';
import { upsertElectoralResults } from './upsert/electoral-results.js';

function setupHappyPath() {
  vi.mocked(fetchDeputes).mockResolvedValue([
    { id: 1, slug: 'marie-dupont', id_an: 'PA100001' },
  ] as never);
  vi.mocked(upsertOfficials).mockResolvedValue([
    { officialId: 'uuid-1', anId: 'PA100001' },
  ]);
  vi.mocked(fetchVotesForDepute).mockResolvedValue([]);
  vi.mocked(upsertVotes).mockResolvedValue([]);
  vi.mocked(fetchCollaborateurs).mockResolvedValue([]);
  vi.mocked(diffStaffers).mockResolvedValue({
    created: 1,
    ended: 0,
    unchanged: 0,
  });
  vi.mocked(fetchAffiliations).mockResolvedValue([]);
  vi.mocked(diffAffiliations).mockResolvedValue({
    created: 0,
    ended: 0,
    unchanged: 1,
  });
  vi.mocked(fetchDeclarations).mockResolvedValue([]);
  vi.mocked(upsertInterests).mockResolvedValue({ created: 0, updated: 0 });
  vi.mocked(fetchAddresses).mockResolvedValue([]);
  vi.mocked(upsertAddresses).mockResolvedValue({ created: 0, updated: 0 });
  vi.mocked(fetchActivities).mockResolvedValue([]);
  vi.mocked(upsertParliamentaryActivity).mockResolvedValue({
    created: 2,
    updated: 0,
  });
  vi.mocked(fetchCommittees).mockResolvedValue([]);
  vi.mocked(upsertCommittees).mockResolvedValue({ created: 0, updated: 0 });
  vi.mocked(fetchElectionResults).mockResolvedValue([]);
  vi.mocked(upsertElectoralResults).mockResolvedValue({
    created: 0,
    updated: 0,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('run', () => {
  it('orchestrates all ingestion steps and returns summary', async () => {
    setupHappyPath();

    const results = await run();

    expect(results).toHaveLength(9);
    expect(results[0].source).toBe('officials');
    expect(results.every((r) => !r.error)).toBe(true);
    expect(fetchDeputes).toHaveBeenCalledTimes(1);
    expect(upsertOfficials).toHaveBeenCalledTimes(1);
  });

  it('catches step errors without stopping the run', async () => {
    setupHappyPath();
    vi.mocked(fetchCollaborateurs).mockRejectedValue(
      new Error('network timeout'),
    );

    const results = await run();

    expect(results).toHaveLength(9);
    const collabResult = results.find((r) => r.source === 'collaborateurs');
    expect(collabResult?.error).toContain('network timeout');

    const otherResults = results.filter((r) => r.source !== 'collaborateurs');
    expect(otherResults.every((r) => !r.error)).toBe(true);
  });
});
