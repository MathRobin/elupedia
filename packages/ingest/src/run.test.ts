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
  campaignAccounts: {},
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
vi.mock('./sources/hatvp.js', () => ({
  fetchDeclarations: vi.fn(),
}));
vi.mock('./sources/an-commissions.js', () => ({
  fetchCommittees: vi.fn(),
}));
vi.mock('./sources/an-scrutins.js', () => ({
  fetchScrutins: vi.fn(),
}));

vi.mock('./upsert/officials.js', () => ({
  upsertOfficials: vi.fn(),
}));
vi.mock('./upsert/staffers-diff.js', () => ({
  diffStaffers: vi.fn(),
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
vi.mock('./upsert/an-votes.js', () => ({
  upsertAnVotes: vi.fn(),
}));
vi.mock('./upsert/provenance.js', () => ({
  writeProvenance: vi.fn(),
}));

vi.mock('./upsert/declaration-snapshots.js', () => ({
  upsertDeclarationSnapshots: vi.fn(),
}));
vi.mock('./sources/senat.js', () => ({
  fetchSenateurs: vi.fn(),
}));
vi.mock('./upsert/senators.js', () => ({
  upsertSenators: vi.fn(),
}));
vi.mock('./sources/senat-scrutins.js', () => ({
  fetchSenatScrutins: vi.fn(),
}));
vi.mock('./upsert/senat-votes.js', () => ({
  upsertSenatVotes: vi.fn(),
}));
vi.mock('./sources/senat-groupes.js', () => ({
  fetchSenatGroupes: vi.fn(),
}));
vi.mock('./upsert/senat-affiliations.js', () => ({
  upsertSenatAffiliations: vi.fn(),
}));
vi.mock('./sources/senat-collaborateurs.js', () => ({
  fetchSenatCollaborateurs: vi.fn(),
}));
vi.mock('./upsert/senat-staffers-diff.js', () => ({
  diffSenatStaffers: vi.fn(),
}));
vi.mock('./sources/senat-adresses.js', () => ({
  fetchSenatAdresses: vi.fn(),
}));
vi.mock('./upsert/senat-addresses.js', () => ({
  upsertSenatAddresses: vi.fn(),
}));
vi.mock('./sources/senat-elections.js', () => ({
  fetchSenatElections: vi.fn(),
}));
vi.mock('./upsert/senat-electoral-results.js', () => ({
  upsertSenatElectoralResults: vi.fn(),
}));
vi.mock('./sources/senat-activite.js', () => ({
  fetchSenatActivities: vi.fn(),
}));
vi.mock('./upsert/senat-parliamentary-activity.js', () => ({
  upsertSenatParliamentaryActivity: vi.fn(),
}));
vi.mock('./sources/senat-commissions.js', () => ({
  fetchSenatCommissions: vi.fn(),
}));
vi.mock('./upsert/senat-committees.js', () => ({
  upsertSenatCommittees: vi.fn(),
}));
vi.mock('./sources/senat-reseaux-sociaux.js', () => ({
  fetchSenatSocialLinks: vi.fn(),
}));
vi.mock('./upsert/senat-social-links.js', () => ({
  upsertSenatSocialLinks: vi.fn(),
}));
vi.mock('./sources/rne-maires.js', () => ({
  fetchRneMaires: vi.fn(),
}));
vi.mock('./upsert/mayors.js', () => ({
  upsertMayors: vi.fn(),
}));
vi.mock('./sources/dila-mairies.js', () => ({
  fetchDilaMairies: vi.fn(),
}));
vi.mock('./upsert/mayor-addresses.js', () => ({
  upsertMayorAddresses: vi.fn(),
}));
vi.mock('./upsert/mayor-social-scrape.js', () => ({
  scrapeMayorWebsites: vi.fn(),
}));
vi.mock('./sources/wikidata-mayor-photos.js', () => ({
  fetchWikidataMayorPhotos: vi.fn(),
}));
vi.mock('./upsert/mayor-photos.js', () => ({
  upsertMayorPhotos: vi.fn(),
}));
vi.mock('./upsert/geocode-addresses.js', () => ({
  geocodeAllAddresses: vi.fn(),
}));
vi.mock('./upsert/upload-maps.js', () => ({
  uploadMaps: vi.fn(),
}));
vi.mock('./sources/cnccfp.js', () => ({
  fetchCnccfpAccounts: vi.fn(),
  CNCCFP_ELECTIONS: [
    {
      id: 'legislatives_2024',
      type: 'legislatives',
      date: '2024-07-07',
      url: '',
    },
    {
      id: 'legislatives_2022',
      type: 'legislatives',
      date: '2022-06-19',
      url: '',
    },
    {
      id: 'senatoriales_2023',
      type: 'senatoriales',
      date: '2023-09-24',
      url: '',
    },
  ],
}));
vi.mock('./upsert/campaign-accounts.js', () => ({
  upsertCampaignAccounts: vi.fn(),
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
import { fetchDeclarations } from './sources/hatvp.js';
import { upsertInterests } from './upsert/interests.js';
import { fetchCommittees } from './sources/an-commissions.js';
import { upsertCommittees } from './upsert/committees.js';
import { fetchScrutins } from './sources/an-scrutins.js';
import { upsertAnVotes } from './upsert/an-votes.js';
import { fetchSenateurs } from './sources/senat.js';
import { upsertSenators } from './upsert/senators.js';
import { fetchSenatScrutins } from './sources/senat-scrutins.js';
import { upsertSenatVotes } from './upsert/senat-votes.js';
import { fetchSenatGroupes } from './sources/senat-groupes.js';
import { upsertSenatAffiliations } from './upsert/senat-affiliations.js';
import { fetchSenatCollaborateurs } from './sources/senat-collaborateurs.js';
import { diffSenatStaffers } from './upsert/senat-staffers-diff.js';
import { fetchSenatAdresses } from './sources/senat-adresses.js';
import { upsertSenatAddresses } from './upsert/senat-addresses.js';
import { fetchSenatElections } from './sources/senat-elections.js';
import { upsertSenatElectoralResults } from './upsert/senat-electoral-results.js';
import { upsertDeclarationSnapshots } from './upsert/declaration-snapshots.js';
import { fetchSenatActivities } from './sources/senat-activite.js';
import { upsertSenatParliamentaryActivity } from './upsert/senat-parliamentary-activity.js';
import { fetchSenatCommissions } from './sources/senat-commissions.js';
import { upsertSenatCommittees } from './upsert/senat-committees.js';
import { fetchSenatSocialLinks } from './sources/senat-reseaux-sociaux.js';
import { upsertSenatSocialLinks } from './upsert/senat-social-links.js';
import { fetchRneMaires } from './sources/rne-maires.js';
import { upsertMayors } from './upsert/mayors.js';
import { fetchDilaMairies } from './sources/dila-mairies.js';
import { upsertMayorAddresses } from './upsert/mayor-addresses.js';
import { scrapeMayorWebsites } from './upsert/mayor-social-scrape.js';
import { fetchWikidataMayorPhotos } from './sources/wikidata-mayor-photos.js';
import { upsertMayorPhotos } from './upsert/mayor-photos.js';
import { geocodeAllAddresses } from './upsert/geocode-addresses.js';
import { uploadMaps } from './upsert/upload-maps.js';
import { fetchCnccfpAccounts } from './sources/cnccfp.js';
import { upsertCampaignAccounts } from './upsert/campaign-accounts.js';

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
  vi.mocked(fetchDeclarations).mockResolvedValue([]);
  vi.mocked(upsertInterests).mockResolvedValue({ created: 0, updated: 0 });
  vi.mocked(upsertDeclarationSnapshots).mockResolvedValue({
    created: 0,
    updated: 0,
  });
  vi.mocked(fetchAddresses).mockResolvedValue([]);
  vi.mocked(upsertAddresses).mockResolvedValue({ created: 0, updated: 0 });
  vi.mocked(fetchActivities).mockResolvedValue([]);
  vi.mocked(upsertParliamentaryActivity).mockResolvedValue({
    created: 2,
    updated: 0,
  });
  vi.mocked(fetchCommittees).mockResolvedValue([]);
  vi.mocked(upsertCommittees).mockResolvedValue({ created: 0, updated: 0 });
  vi.mocked(fetchScrutins).mockResolvedValue([]);
  vi.mocked(upsertAnVotes).mockResolvedValue({ created: 0, updated: 0 });
  vi.mocked(fetchSenateurs).mockResolvedValue([]);
  vi.mocked(upsertSenators).mockResolvedValue({ officials: 0, mandates: 0 });
  vi.mocked(fetchSenatScrutins).mockResolvedValue([]);
  vi.mocked(upsertSenatVotes).mockResolvedValue({ ballots: 0, votes: 0 });
  vi.mocked(fetchSenatGroupes).mockResolvedValue([]);
  vi.mocked(upsertSenatAffiliations).mockResolvedValue({
    created: 0,
    updated: 0,
  });
  vi.mocked(fetchSenatCollaborateurs).mockResolvedValue([]);
  vi.mocked(diffSenatStaffers).mockResolvedValue({
    created: 0,
    ended: 0,
    unchanged: 0,
  });
  vi.mocked(fetchSenatAdresses).mockResolvedValue([]);
  vi.mocked(upsertSenatAddresses).mockResolvedValue({ created: 0, updated: 0 });
  vi.mocked(fetchSenatElections).mockResolvedValue([]);
  vi.mocked(upsertSenatElectoralResults).mockResolvedValue({
    created: 0,
    updated: 0,
    skipped: 0,
  });
  vi.mocked(fetchSenatActivities).mockResolvedValue([]);
  vi.mocked(upsertSenatParliamentaryActivity).mockResolvedValue({
    created: 0,
    updated: 0,
    skipped: 0,
  });
  vi.mocked(fetchSenatCommissions).mockResolvedValue([]);
  vi.mocked(upsertSenatCommittees).mockResolvedValue({
    created: 0,
    updated: 0,
    skipped: 0,
  });
  vi.mocked(fetchSenatSocialLinks).mockResolvedValue([]);
  vi.mocked(upsertSenatSocialLinks).mockResolvedValue({
    created: 0,
    updated: 0,
    skipped: 0,
  });
  vi.mocked(fetchRneMaires).mockResolvedValue([]);
  vi.mocked(upsertMayors).mockResolvedValue({
    officials: 0,
    mandates: 0,
    ended: 0,
    skipped: 0,
  });
  vi.mocked(fetchDilaMairies).mockResolvedValue([]);
  vi.mocked(upsertMayorAddresses).mockResolvedValue({
    created: 0,
    updated: 0,
    websites: 0,
    skipped: 0,
  });
  vi.mocked(scrapeMayorWebsites).mockResolvedValue({
    created: 0,
    skipped: 0,
    errors: 0,
  });
  vi.mocked(fetchWikidataMayorPhotos).mockResolvedValue([]);
  vi.mocked(upsertMayorPhotos).mockResolvedValue({
    matched: 0,
    updated: 0,
    skipped: 0,
  });
  vi.mocked(geocodeAllAddresses).mockResolvedValue({
    geocoded: 0,
    failed: 0,
  });
  vi.mocked(uploadMaps).mockResolvedValue({
    uploaded: 0,
    skipped: 0,
    failed: 0,
  });
  vi.mocked(fetchCnccfpAccounts).mockResolvedValue([]);
  vi.mocked(upsertCampaignAccounts).mockResolvedValue({
    created: 0,
    updated: 0,
    skipped: 0,
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

    expect(results).toHaveLength(23);
    expect(results[0].source).toBe('deputes');
    expect(results.every((r) => !r.error)).toBe(true);
    expect(fetchDeputes).toHaveBeenCalledTimes(1);
    expect(upsertOfficials).toHaveBeenCalledTimes(1);
  });

  it('runs only specified steps when enabledSteps is provided', async () => {
    setupHappyPath();

    const results = await run(new Set(['deputes', 'committees']));

    expect(results).toHaveLength(2);
    expect(results[0].source).toBe('deputes');
    expect(results[1].source).toBe('committees');
    expect(fetchCollaborateurs).not.toHaveBeenCalled();
    expect(fetchDeclarations).not.toHaveBeenCalled();
    expect(fetchAddresses).not.toHaveBeenCalled();
    expect(fetchActivities).not.toHaveBeenCalled();
  });

  it('catches step errors without stopping the run', async () => {
    setupHappyPath();
    vi.mocked(fetchCollaborateurs).mockRejectedValue(
      new Error('network timeout'),
    );

    const results = await run();

    expect(results).toHaveLength(23);
    const collabResult = results.find((r) => r.source === 'collaborateurs');
    expect(collabResult?.error).toContain('network timeout');

    const otherResults = results.filter((r) => r.source !== 'collaborateurs');
    expect(otherResults.every((r) => !r.error)).toBe(true);
  });
});
