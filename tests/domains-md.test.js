import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const domainsMd = readFileSync(resolve(root, 'docs/DOMAINS.md'), 'utf-8');

const domains = [
  'Élus et mandats',
  'Activité parlementaire',
  'Votes et scrutins',
  'Affiliations politiques',
  'Collaborateurs',
  'Intérêts et patrimoine',
  'Commissions',
  'Mentions presse',
  'Adresses et contacts',
  'Historique électoral',
];

describe('docs/DOMAINS.md', () => {
  it('exists', () => {
    expect(existsSync(resolve(root, 'docs/DOMAINS.md'))).toBe(true);
  });

  for (const domain of domains) {
    it(`documents domain "${domain}"`, () => {
      expect(domainsMd).toContain(domain);
    });
  }

  it('mentions tables and sources for each domain', () => {
    expect(domainsMd).toContain('**Tables**');
    expect(domainsMd).toContain('**Source**');
  });
});

describe('error case', () => {
  it('reading a non-existent doc throws', () => {
    expect(() =>
      readFileSync(resolve(root, 'docs/NONEXISTENT.md'), 'utf-8'),
    ).toThrow();
  });
});
