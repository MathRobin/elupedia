import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const embedPath = resolve(
  root,
  'packages/site/src/pages/elus/[slug]/embed.astro',
);

describe('Embed card — /elus/[slug]/embed', () => {
  it('file exists', () => {
    expect(existsSync(embedPath)).toBe(true);
  });

  const content = readFileSync(embedPath, 'utf-8');

  it('is server-rendered (prerender = false)', () => {
    expect(content).toContain('export const prerender = false');
  });

  it('queries officials with mandates', () => {
    expect(content).toContain('officials');
    expect(content).toContain('mandates');
  });

  it('displays photo', () => {
    expect(content).toContain('<img');
    expect(content).toContain('photo');
  });

  it('displays full name', () => {
    expect(content).toContain('fullName');
    expect(content).toContain('row.firstName');
    expect(content).toContain('row.lastName');
  });

  it('displays mandate type with French labels', () => {
    expect(content).toContain('mandateLabels');
    expect(content).toContain('Député');
    expect(content).toContain('Sénateur');
    expect(content).toContain('Maire');
  });

  it('displays mandate start date', () => {
    expect(content).toContain('startFormatted');
    expect(content).toContain('row.startDate');
    expect(content).toContain('Depuis le');
  });

  it('links to the full profile in a new tab', () => {
    expect(content).toContain('target="_blank"');
    expect(content).toContain('rel="noopener noreferrer"');
    expect(content).toContain('profileUrl');
    expect(content).toContain('elupedia.fr/elus/');
  });

  it('has dark mode support', () => {
    expect(content).toContain('prefers-color-scheme: dark');
  });

  it('is a standalone HTML page (not using BaseLayout)', () => {
    expect(content).toContain('<html');
    expect(content).not.toContain('BaseLayout');
  });
});
