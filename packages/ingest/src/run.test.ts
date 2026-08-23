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

vi.mock('./sources/assemblee-nationale.js', () => ({
  fetchDeputes: vi.fn(),
}));
vi.mock('./sources/an-collaborateurs.js', () => ({
  fetchCollaborateurs: vi.fn(),
}));
vi.mock('./sources/an-adresses.js', () => ({
  fetchAddresses: vi.fn(),
}));
vi.mock('./sources/an-activite.js', () => ({
  fetchActivities: vi.fn(),
}));
vi.mock('./upsert/officials.js', () => ({
  upsertOfficials: vi.fn(),
}));
vi.mock('./upsert/staffers-diff.js', () => ({
  diffStaffers: vi.fn(),
}));
vi.mock('./upsert/addresses.js', () => ({
  upsertAddresses: vi.fn(),
}));
vi.mock('./upsert/parliamentary-activity.js', () => ({
  upsertParliamentaryActivity: vi.fn(),
}));

import { run } from './run.js';
import { fetchDeputes } from './sources/assemblee-nationale.js';
import { fetchCollaborateurs } from './sources/an-collaborateurs.js';
import { fetchAddresses } from './sources/an-adresses.js';
import { fetchActivities } from './sources/an-activite.js';
import { upsertOfficials } from './upsert/officials.js';
import { diffStaffers } from './upsert/staffers-diff.js';
import { upsertAddresses } from './upsert/addresses.js';
import { upsertParliamentaryActivity } from './upsert/parliamentary-activity.js';

function setupHappyPath() {
  vi.mocked(fetchDeputes).mockResolvedValue([
    {
      id_an: 'PA100001',
      nom: 'Dupont',
      prenom: 'Marie',
      sexe: 'F',
      date_naissance: '1975-03-14',
      nom_circo: 'Gironde',
      num_deptmt: '33',
      num_circo: 3,
      mandat_debut: '2024-07-07',
      slug: 'marie-dupont',
      photo_url:
        'https://www2.assemblee-nationale.fr/static/tribun/17/photos/100001.jpg',
    },
  ]);
  vi.mocked(upsertOfficials).mockResolvedValue([
    { officialId: 'uuid-1', anId: 'PA100001' },
  ]);
  vi.mocked(fetchCollaborateurs).mockResolvedValue([]);
  vi.mocked(diffStaffers).mockResolvedValue({
    created: 1,
    ended: 0,
    unchanged: 0,
  });
  vi.mocked(fetchAddresses).mockResolvedValue([]);
  vi.mocked(upsertAddresses).mockResolvedValue({ created: 0, updated: 0 });
  vi.mocked(fetchActivities).mockResolvedValue([]);
  vi.mocked(upsertParliamentaryActivity).mockResolvedValue({
    created: 2,
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

    expect(results).toHaveLength(4);
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

    expect(results).toHaveLength(4);
    const collabResult = results.find((r) => r.source === 'collaborateurs');
    expect(collabResult?.error).toContain('network timeout');

    const otherResults = results.filter((r) => r.source !== 'collaborateurs');
    expect(otherResults.every((r) => !r.error)).toBe(true);
  });
});
