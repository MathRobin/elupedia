import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Page mentions légales (#85)', () => {
  const pagePath = resolve(
    root,
    'packages/site/src/pages/mentions-legales.astro',
  );
  const layoutPath = resolve(
    root,
    'packages/site/src/layouts/BaseLayout.astro',
  );

  it('mentions-legales.astro exists', () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  it('lists data sources with licences', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Assemblée nationale');
    expect(content).toContain('Licence Ouverte 2.0');
    expect(content).toContain('data.assemblee-nationale.fr');
  });

  it('mentions AGPL-3.0 code license', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('AGPL-3.0');
  });

  it('mentions the hosting provider', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Vercel');
  });

  it('links to the GitHub repo', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('github.com/MathRobin/elupedia');
  });

  it('is linked from the layout navigation', () => {
    const layout = readFileSync(layoutPath, 'utf-8');
    expect(layout).toContain('/mentions-legales');
    expect(layout).toContain('Mentions légales');
  });
});
