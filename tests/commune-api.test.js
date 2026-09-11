import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const apiPath = resolve(root, 'packages/site/src/pages/api/commune/[code].ts');

describe('API Commune — /api/commune/[code]', () => {
  it('file exists', () => {
    expect(existsSync(apiPath)).toBe(true);
  });

  const content = readFileSync(apiPath, 'utf-8');

  it('is server-rendered (prerender = false)', () => {
    expect(content).toContain('export const prerender = false');
  });

  it('exports a GET handler', () => {
    expect(content).toContain('export const GET');
  });

  it('validates INSEE code format (5 digits)', () => {
    expect(content).toContain('/^\\d{5}$/');
    expect(content).toContain('400');
  });

  it('queries mandates and officials', () => {
    expect(content).toContain('mandates');
    expect(content).toContain('officials');
    expect(content).toContain('innerJoin');
  });

  it('filters on commune_code and parent_commune_code', () => {
    expect(content).toContain('communeCode');
    expect(content).toContain('parentCommuneCode');
  });

  it('returns only active mandates (endDate is null)', () => {
    expect(content).toContain('isNull(mandates.endDate)');
  });

  it('builds Elupedia URLs in response', () => {
    expect(content).toContain("const baseUrl = 'https://www.elupedia.fr'");
    expect(content).toContain('`${baseUrl}/elus/');
  });

  it('returns JSON with appropriate cache header', () => {
    expect(content).toContain("'Content-Type': 'application/json'");
    expect(content).toContain('Cache-Control');
    expect(content).toContain('86400');
  });
});

describe('API Commune — documentation page', () => {
  const docPath = resolve(
    root,
    'packages/site/src/pages/docs/commune-api.astro',
  );

  it('documentation page exists', () => {
    expect(existsSync(docPath)).toBe(true);
  });

  const content = readFileSync(docPath, 'utf-8');

  it('uses BaseLayout', () => {
    expect(content).toContain('<BaseLayout');
  });

  it('documents the endpoint URL', () => {
    expect(content).toContain('/api/commune/');
  });

  it('documents the INSEE code parameter', () => {
    expect(content).toContain('INSEE');
    expect(content).toContain('5 chiffres');
  });

  it('documents the response fields', () => {
    expect(content).toContain('firstName');
    expect(content).toContain('lastName');
    expect(content).toContain('mandateType');
    expect(content).toContain('politicalGroup');
  });

  it('has a back link to docs index', () => {
    expect(content).toContain('href="/docs"');
  });
});

describe('API Commune — docs index entry', () => {
  const indexPath = resolve(root, 'packages/site/src/pages/docs/index.astro');
  const content = readFileSync(indexPath, 'utf-8');

  it('links to commune-api doc page', () => {
    expect(content).toContain('href="/docs/commune-api"');
  });

  it('mentions API Commune in the card', () => {
    expect(content).toContain('API Commune');
  });
});
