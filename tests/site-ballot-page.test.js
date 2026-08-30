import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Page détail scrutin (#66)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/scrutins/[id].astro');

  it('[id].astro exists', () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  it('exports getStaticPaths', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('export async function getStaticPaths');
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
