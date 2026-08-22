import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Fiche élu (#53)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('[slug].astro exists', () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  it('exports getStaticPaths', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('export async function getStaticPaths');
  });

  it('queries officials with active mandates', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('officials');
    expect(content).toContain('mandates');
    expect(content).toContain('isNull(mandates.endDate)');
  });

  it('displays identity (name, photo, birth date)', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('deputy.firstName');
    expect(content).toContain('deputy.lastName');
    expect(content).toContain('deputy.photoUrl');
    expect(content).toContain('deputy.birthDate');
  });

  it('displays current mandate details', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('deputy.mandateType');
    expect(content).toContain('deputy.district');
    expect(content).toContain('deputy.politicalGroup');
    expect(content).toContain('deputy.startDate');
  });

  it('has a back link to the homepage', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('href="/"');
    expect(content).toContain('Retour');
  });

  it('uses BaseLayout with dynamic title', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('<BaseLayout');
    expect(content).toContain('title={fullName}');
  });

  it('homepage links to /elus/ path', () => {
    const indexPath = resolve(root, 'packages/site/src/pages/index.astro');
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('/elus/');
  });
});

describe('Fiche élu — section votes (#54)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries votes and ballots', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('votes');
    expect(content).toContain('ballots');
  });

  it('sorts votes by date descending', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('desc(ballots.date)');
  });

  it('displays vote history table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('<table');
    expect(content).toContain('v.ballotTitle');
    expect(content).toContain('v.ballotDate');
    expect(content).toContain('v.position');
  });

  it('translates vote positions to French', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain("for: 'Pour'");
    expect(content).toContain("against: 'Contre'");
    expect(content).toContain("abstain: 'Abstention'");
    expect(content).toContain("absent: 'Absent'");
  });

  it('handles empty votes list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucun vote enregistré');
  });

  it('has color-coded position badges', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('positionColors');
    expect(content).toContain('text-green-700');
    expect(content).toContain('text-red-700');
  });
});

describe('Fiche élu — section affiliations (#55)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');

  it('queries affiliations table', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('affiliations');
    expect(content).toContain('affiliationsByOfficial');
  });

  it('sorts affiliations by date descending', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('desc(affiliations.startDate)');
  });

  it('displays party/group name and date range', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('a.partyOrGroup');
    expect(content).toContain('a.startDate');
    expect(content).toContain('a.endDate');
  });

  it('shows "en cours" for active affiliations', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('en cours');
  });

  it('handles empty affiliations list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucune affiliation enregistrée');
  });
});
