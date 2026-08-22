import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Audit accessibilité de base (#74)', () => {
  const layoutPath = resolve(
    root,
    'packages/site/src/layouts/BaseLayout.astro',
  );
  const globalCssPath = resolve(root, 'packages/site/src/styles/global.css');
  const indexPath = resolve(root, 'packages/site/src/pages/index.astro');
  const deputyPath = resolve(root, 'packages/site/src/pages/elus/[slug].astro');
  const ballotPath = resolve(
    root,
    'packages/site/src/pages/scrutins/[id].astro',
  );

  it('has lang="fr" on html element', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('lang="fr"');
  });

  it('has skip-to-content link', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('#main-content');
    expect(content).toContain('Aller au contenu principal');
  });

  it('main has id for skip link target', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('id="main-content"');
  });

  it('nav has aria-label', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('aria-label="Navigation principale"');
  });

  it('has global focus-visible styles', () => {
    const content = readFileSync(globalCssPath, 'utf-8');
    expect(content).toContain('focus-visible');
    expect(content).toContain('outline');
  });

  it('header contains navigation links', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('/a-propos');
    expect(content).toContain('/donnees-personnelles');
  });

  it('index page does not use text-gray-400 for informative text', () => {
    const content = readFileSync(indexPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.includes('text-gray-400') && !line.includes('rounded-full')) {
        throw new Error(
          `Found text-gray-400 on informative text: ${line.trim()}`,
        );
      }
    }
  });

  it('deputy page section counts use accessible contrast', () => {
    const content = readFileSync(deputyPath, 'utf-8');
    expect(content).not.toMatch(/text-sm font-normal text-gray-400/);
  });

  it('ballot page uses accessible contrast for counts', () => {
    const content = readFileSync(ballotPath, 'utf-8');
    expect(content).not.toMatch(/text-sm font-normal text-gray-400/);
  });
});
