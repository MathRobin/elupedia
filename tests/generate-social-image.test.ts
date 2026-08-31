import { describe, it, expect } from 'vitest';
import {
  buildOfficialMarkup,
  buildVoteMarkup,
  renderToPng,
  type OfficialData,
  type VoteData,
} from '../scripts/generate-social-image.js';

const officialData: OfficialData = {
  firstName: 'Marie',
  lastName: 'Dupont',
  photoUrl: null,
  politicalGroup: 'Les Républicains',
  district: '3e circ.',
  department: 'Paris',
  slug: 'marie-dupont',
  mandateType: 'depute',
};

const voteData: VoteData = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  title: "Projet de loi relatif à l'accélération de la transition énergétique",
  date: '2026-03-15',
  forCount: 312,
  againstCount: 245,
  abstainCount: 12,
  absentCount: 8,
};

describe('buildOfficialMarkup', () => {
  it('returns a valid satori element tree', () => {
    const markup = buildOfficialMarkup(officialData);
    expect(markup).toHaveProperty('type', 'div');
    expect(markup).toHaveProperty('props');
    expect((markup.props as Record<string, unknown>).children).toBeDefined();
  });

  it('includes the official name in the tree', () => {
    const markup = buildOfficialMarkup(officialData);
    const json = JSON.stringify(markup);
    expect(json).toContain('Marie');
    expect(json).toContain('Dupont');
  });

  it('includes political group', () => {
    const json = JSON.stringify(buildOfficialMarkup(officialData));
    expect(json).toContain('Les Républicains');
  });

  it('includes the page URL', () => {
    const json = JSON.stringify(buildOfficialMarkup(officialData));
    expect(json).toContain('elupedia.fr/elus/marie-dupont');
  });
});

describe('buildVoteMarkup', () => {
  it('returns a valid satori element tree', () => {
    const markup = buildVoteMarkup(voteData);
    expect(markup).toHaveProperty('type', 'div');
    expect(markup).toHaveProperty('props');
  });

  it('includes the vote title', () => {
    const json = JSON.stringify(buildVoteMarkup(voteData));
    expect(json).toContain('transition énergétique');
  });

  it('includes vote counts', () => {
    const json = JSON.stringify(buildVoteMarkup(voteData));
    expect(json).toContain('312');
    expect(json).toContain('245');
  });

  it('marks adopted when for > against', () => {
    const json = JSON.stringify(buildVoteMarkup(voteData));
    expect(json).toContain('Adopté');
  });

  it('marks rejected when against > for', () => {
    const rejected = { ...voteData, forCount: 100, againstCount: 400 };
    const json = JSON.stringify(buildVoteMarkup(rejected));
    expect(json).toContain('Rejeté');
  });
});

describe('buildOfficialMarkup edge cases', () => {
  it('handles missing photo, group, district, department', () => {
    const minimal: OfficialData = {
      firstName: 'Jean',
      lastName: 'Martin',
      photoUrl: null,
      politicalGroup: null,
      district: null,
      department: null,
      slug: null,
      mandateType: 'depute',
    };
    const json = JSON.stringify(buildOfficialMarkup(minimal));
    expect(json).toContain('Jean Martin');
    expect(json).toContain('JM');
    expect(json).not.toContain('null');
  });
});

describe('renderToPng', () => {
  it('generates a PNG buffer for official mode', async () => {
    const markup = buildOfficialMarkup(officialData);
    const png = await renderToPng(markup);
    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(1000);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });

  it('generates a PNG buffer for vote mode', async () => {
    const markup = buildVoteMarkup(voteData);
    const png = await renderToPng(markup);
    expect(png).toBeInstanceOf(Buffer);
    expect(png.length).toBeGreaterThan(1000);
    expect(png[0]).toBe(0x89);
  });
});
