import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('BaseLayout (#45)', () => {
  const layoutPath = resolve(
    root,
    'packages/site/src/layouts/BaseLayout.astro',
  );

  it('BaseLayout.astro exists', () => {
    expect(existsSync(layoutPath)).toBe(true);
  });

  it('has header with site name', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('<header');
    expect(content).toContain('Elupedia');
  });

  it('has footer', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('<footer');
  });

  it('has meta description', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('meta name="description"');
  });

  it('has dynamic title prop', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('title?:');
    expect(content).toContain('{fullTitle}');
  });
});

describe('tarteaucitron.js integration (#46)', () => {
  const layoutPath = resolve(
    root,
    'packages/site/src/layouts/BaseLayout.astro',
  );

  it('loads tarteaucitron script', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('tarteaucitron.min.js');
  });

  it('initializes tarteaucitron with CNIL-compliant config', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('tarteaucitron.init');
    expect(content).toContain('DenyAllCta');
    expect(content).toContain('AcceptAllCta');
    expect(content).toContain('highPrivacy');
  });

  it('loads tarteaucitron CSS', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('tarteaucitron.css');
  });

  it('tarteaucitron files exist in public/', () => {
    expect(
      existsSync(
        resolve(
          root,
          'packages/site/public/tarteaucitron/tarteaucitron.min.js',
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        resolve(
          root,
          'packages/site/public/tarteaucitron/css/tarteaucitron.css',
        ),
      ),
    ).toBe(true);
  });
});
