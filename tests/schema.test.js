import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getTableName } from 'drizzle-orm';

const root = resolve(import.meta.dirname, '..');
const schemaDir = resolve(root, 'packages/shared/src/schema');

describe('schema files exist', () => {
  const schemaFiles = [
    'officials.ts',
    'mandates.ts',
    'ballots.ts',
    'votes.ts',
    'staffers.ts',
    'affiliations.ts',
    'interests.ts',
    'addresses.ts',
    'external-links.ts',
    'press-mentions.ts',
    'parliamentary-activity.ts',
    'committees.ts',
    'electoral-results.ts',
    'index.ts',
  ];

  for (const file of schemaFiles) {
    it(`schema/${file} exists`, () => {
      expect(existsSync(resolve(schemaDir, file))).toBe(true);
    });
  }
});

describe('#9 — officials, mandates', () => {
  it('officials table has correct name and columns', async () => {
    const { officials } =
      await import('../packages/shared/src/schema/officials.js');
    expect(getTableName(officials)).toBe('officials');
    const cols = Object.keys(officials);
    expect(cols).toContain('id');
    expect(cols).toContain('firstName');
    expect(cols).toContain('lastName');
    expect(cols).toContain('anId');
    expect(cols).toContain('birthDate');
    expect(cols).toContain('photoUrl');
  });

  it('mandates table has correct name and columns', async () => {
    const { mandates } =
      await import('../packages/shared/src/schema/mandates.js');
    expect(getTableName(mandates)).toBe('mandates');
    const cols = Object.keys(mandates);
    expect(cols).toContain('officialId');
    expect(cols).toContain('type');
    expect(cols).toContain('district');
    expect(cols).toContain('startDate');
    expect(cols).toContain('endDate');
    expect(cols).toContain('politicalGroup');
  });
});

describe('#10 — ballots, votes', () => {
  it('ballots table has correct columns', async () => {
    const { ballots } =
      await import('../packages/shared/src/schema/ballots.js');
    expect(getTableName(ballots)).toBe('ballots');
    const cols = Object.keys(ballots);
    expect(cols).toContain('anId');
    expect(cols).toContain('title');
    expect(cols).toContain('date');
    expect(cols).toContain('type');
  });

  it('votes table has correct columns', async () => {
    const { votes } = await import('../packages/shared/src/schema/votes.js');
    expect(getTableName(votes)).toBe('votes');
    const cols = Object.keys(votes);
    expect(cols).toContain('ballotId');
    expect(cols).toContain('officialId');
    expect(cols).toContain('position');
  });

  it('votePositionEnum has valid values', async () => {
    const { votePositionEnum } =
      await import('../packages/shared/src/schema/votes.js');
    expect(votePositionEnum).toEqual(['for', 'against', 'abstain', 'absent']);
  });
});

describe('#11 — staffers', () => {
  it('staffers table has correct columns', async () => {
    const { staffers } =
      await import('../packages/shared/src/schema/staffers.js');
    expect(getTableName(staffers)).toBe('staffers');
    const cols = Object.keys(staffers);
    expect(cols).toContain('officialId');
    expect(cols).toContain('firstName');
    expect(cols).toContain('lastName');
    expect(cols).toContain('startDate');
    expect(cols).toContain('endDate');
  });

  it('staffers schema file declares an index on official_id', () => {
    const content = readFileSync(resolve(schemaDir, 'staffers.ts'), 'utf-8');
    expect(content).toContain('staffers_official_id_idx');
  });
});

describe('#12 — affiliations', () => {
  it('affiliations table has correct columns', async () => {
    const { affiliations } =
      await import('../packages/shared/src/schema/affiliations.js');
    expect(getTableName(affiliations)).toBe('affiliations');
    const cols = Object.keys(affiliations);
    expect(cols).toContain('officialId');
    expect(cols).toContain('partyOrGroup');
    expect(cols).toContain('startDate');
    expect(cols).toContain('endDate');
  });
});

describe('#13 — interests (HATVP)', () => {
  it('interests table has correct columns', async () => {
    const { interests } =
      await import('../packages/shared/src/schema/interests.js');
    expect(getTableName(interests)).toBe('interests');
    const cols = Object.keys(interests);
    expect(cols).toContain('officialId');
    expect(cols).toContain('type');
    expect(cols).toContain('entityName');
    expect(cols).toContain('roleDescription');
    expect(cols).toContain('declaredDate');
  });

  it('interestTypeEnum has valid values', async () => {
    const { interestTypeEnum } =
      await import('../packages/shared/src/schema/interests.js');
    expect(interestTypeEnum).toEqual(['company_share', 'nonprofit_role']);
  });
});

describe('#14 — addresses, external_links', () => {
  it('addresses table has correct columns', async () => {
    const { addresses } =
      await import('../packages/shared/src/schema/addresses.js');
    expect(getTableName(addresses)).toBe('addresses');
    const cols = Object.keys(addresses);
    expect(cols).toContain('type');
    expect(cols).toContain('street');
    expect(cols).toContain('postalCode');
    expect(cols).toContain('city');
    expect(cols).toContain('phone');
    expect(cols).toContain('email');
  });

  it('external_links table has correct columns', async () => {
    const { externalLinks } =
      await import('../packages/shared/src/schema/external-links.js');
    expect(getTableName(externalLinks)).toBe('external_links');
    const cols = Object.keys(externalLinks);
    expect(cols).toContain('officialId');
    expect(cols).toContain('platform');
    expect(cols).toContain('url');
  });

  it('platformEnum includes all required platforms', async () => {
    const { platformEnum } =
      await import('../packages/shared/src/schema/external-links.js');
    for (const p of [
      'twitter',
      'facebook',
      'instagram',
      'youtube',
      'tiktok',
      'wikipedia_fr',
      'official_page',
      'personal_website',
      'madada',
    ]) {
      expect(platformEnum).toContain(p);
    }
  });
});

describe('#15 — press_mentions', () => {
  it('press_mentions table has correct columns', async () => {
    const { pressMentions } =
      await import('../packages/shared/src/schema/press-mentions.js');
    expect(getTableName(pressMentions)).toBe('press_mentions');
    const cols = Object.keys(pressMentions);
    expect(cols).toContain('officialId');
    expect(cols).toContain('title');
    expect(cols).toContain('sourceName');
    expect(cols).toContain('sourceUrl');
    expect(cols).toContain('publishedDate');
    expect(cols).toContain('summary');
  });
});

describe('#16 — parliamentary_activity', () => {
  it('parliamentary_activity table has correct columns', async () => {
    const { parliamentaryActivity } =
      await import('../packages/shared/src/schema/parliamentary-activity.js');
    expect(getTableName(parliamentaryActivity)).toBe('parliamentary_activity');
    const cols = Object.keys(parliamentaryActivity);
    expect(cols).toContain('officialId');
    expect(cols).toContain('type');
    expect(cols).toContain('title');
    expect(cols).toContain('date');
    expect(cols).toContain('status');
  });

  it('activityTypeEnum has valid values', async () => {
    const { activityTypeEnum } =
      await import('../packages/shared/src/schema/parliamentary-activity.js');
    expect(activityTypeEnum).toEqual([
      'written_question',
      'oral_question',
      'amendment',
      'report',
    ]);
  });

  it('amendmentStatusEnum has valid values', async () => {
    const { amendmentStatusEnum } =
      await import('../packages/shared/src/schema/parliamentary-activity.js');
    expect(amendmentStatusEnum).toEqual(['adopted', 'rejected', 'withdrawn']);
  });
});

describe('#17 — committees', () => {
  it('committees table has correct columns', async () => {
    const { committees } =
      await import('../packages/shared/src/schema/committees.js');
    expect(getTableName(committees)).toBe('committees');
    const cols = Object.keys(committees);
    expect(cols).toContain('officialId');
    expect(cols).toContain('name');
    expect(cols).toContain('type');
    expect(cols).toContain('startDate');
    expect(cols).toContain('endDate');
  });

  it('committeeTypeEnum has valid values', async () => {
    const { committeeTypeEnum } =
      await import('../packages/shared/src/schema/committees.js');
    expect(committeeTypeEnum).toContain('standing_committee');
    expect(committeeTypeEnum).toContain('special_committee');
    expect(committeeTypeEnum).toContain('delegation');
    expect(committeeTypeEnum).toContain('study_group');
    expect(committeeTypeEnum).toContain('friendship_group');
  });
});

describe('#18 — electoral_results', () => {
  it('electoral_results table has correct columns', async () => {
    const { electoralResults } =
      await import('../packages/shared/src/schema/electoral-results.js');
    expect(getTableName(electoralResults)).toBe('electoral_results');
    const cols = Object.keys(electoralResults);
    expect(cols).toContain('officialId');
    expect(cols).toContain('electionType');
    expect(cols).toContain('electionDate');
    expect(cols).toContain('round');
    expect(cols).toContain('scorePercent');
    expect(cols).toContain('opponentCount');
  });
});

describe('schema index re-exports', () => {
  it('index.ts re-exports all tables', async () => {
    const schema = await import('../packages/shared/src/schema/index.js');
    const expectedExports = [
      'officials',
      'mandates',
      'ballots',
      'votes',
      'staffers',
      'affiliations',
      'interests',
      'addresses',
      'externalLinks',
      'pressMentions',
      'parliamentaryActivity',
      'committees',
      'electoralResults',
    ];
    for (const name of expectedExports) {
      expect(schema[name]).toBeDefined();
    }
  });
});

describe('error case', () => {
  it('importing a non-existent schema throws', async () => {
    await expect(
      () => import('../packages/shared/src/schema/nonexistent.js'),
    ).rejects.toThrow();
  });
});
