import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Intégration Pagefind (#72)', () => {
  it('pagefind is in devDependencies', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(root, 'packages/site/package.json'), 'utf-8'),
    );
    expect(pkg.devDependencies.pagefind).toBeDefined();
  });

  it('postbuild script runs pagefind', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(root, 'packages/site/package.json'), 'utf-8'),
    );
    expect(pkg.scripts.postbuild).toContain('pagefind');
    expect(pkg.scripts.postbuild).toContain('--site dist');
  });

  it('deputy page has data-pagefind-body', () => {
    const content = readFileSync(
      resolve(root, 'packages/site/src/pages/elus/[slug].astro'),
      'utf-8',
    );
    expect(content).toContain('data-pagefind-body');
  });

  it('ballot page has data-pagefind-body', () => {
    const content = readFileSync(
      resolve(root, 'packages/site/src/pages/scrutins/[id].astro'),
      'utf-8',
    );
    expect(content).toContain('data-pagefind-body');
  });
});
