import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Page détail scrutin (#66)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/scrutins/[id].astro');

  it('[id].astro exists', () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  it('is server-rendered (prerender = false)', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('export const prerender = false');
  });

  it('queries ballots and votes with officials', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('ballots');
    expect(content).toContain('votes');
    expect(content).toContain('officials');
  });

  it('displays ballot title and date', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('ballot.title');
    expect(content).toContain('ballot.date');
    expect(content).toContain('ballot.type');
  });

  it('lists deputies with name, group and position', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('v.firstName');
    expect(content).toContain('v.lastName');
    expect(content).toContain('v.politicalGroup');
    expect(content).toContain('v.position');
  });

  it('sorts votes by deputy name', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('sortedVotes');
    expect(content).toContain('localeCompare');
  });

  it('translates positions to French with colors', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain("for: 'Pour'");
    expect(content).toContain("against: 'Contre'");
    expect(content).toContain('positionColors');
  });

  it('has position and group filters', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('data-position-filter');
    expect(content).toContain('data-group-filter');
    expect(content).toContain('applyFilters');
  });

  it('links deputy names to their detail page', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('/elus/${v.slug ?? v.officialId}');
  });

  it('handles empty votes list', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Aucun vote enregistré pour ce scrutin');
  });
});

describe('Page détail scrutin — neutralité Parlement européen (M24T7)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/scrutins/[id].astro');

  it('never claims Adopté/Rejeté for europarl ballots (French delegation is a subset, not the whole chamber)', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain("const isEuroparl = ballot.type === 'europarl';");
    expect(content).toContain('ballotVotes.length > 0 && !isEuroparl && (');
  });

  it('explains the French-delegation-only scope for europarl ballots', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain(
      'ne peut pas être déduit de la seule délégation française',
    );
    expect(content).toContain('environ 720 membres du Parlement européen');
  });

  it('hides the hemicycle for europarl ballots (only ~80 of 720 seats are known, not a real seating plan)', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain(
      'ballotVotes.length > 0 && !isEuroparl && (\n      <section class="mt-8">\n        <h2 class="text-lg font-semibold border-l-4 border-indigo-500 pl-3 dark:text-white">\n          Hémicycle',
    );
  });

  it('builds a europarl-specific source link instead of the assemblee-nationale.fr pattern', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain(
      'isEuroparl\n  ? `https://www.europarl.europa.eu/doceo/document/PV-10-${ballot.date}-VOT_FR.html`',
    );
  });

  it('labels the ballot location correctly in JSON-LD', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain(
      "name: isEuroparl ? 'Parlement européen' : 'Assemblée nationale',",
    );
  });

  it('resolves group/department from the mandate matching the ballot origin, not an arbitrary simultaneous mandate', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('voterMandateType');
    expect(content).toContain('eq(mandates.type, voterMandateType)');
  });
});
