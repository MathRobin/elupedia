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

describe('Vercel Web Analytics (#82)', () => {
  const layoutPath = resolve(
    root,
    'packages/site/src/layouts/BaseLayout.astro',
  );

  it('imports and injects @vercel/analytics', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain("import { inject } from '@vercel/analytics'");
    expect(content).toContain('inject()');
  });

  it('@vercel/analytics is a dependency of @elupedia/site', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(root, 'packages/site/package.json'), 'utf-8'),
    );
    expect(pkg.dependencies['@vercel/analytics']).toBeDefined();
  });
});

describe('SEO de base (#47)', () => {
  const layoutPath = resolve(
    root,
    'packages/site/src/layouts/BaseLayout.astro',
  );
  const configPath = resolve(root, 'packages/site/astro.config.ts');

  it('astro config has sitemap integration', () => {
    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain("import sitemap from '@astrojs/sitemap'");
    expect(content).toContain('sitemap()');
  });

  it('astro config has site URL for sitemap generation', () => {
    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain("site: 'https://elupedia.fr'");
  });

  it('has Open Graph meta tags', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('og:title');
    expect(content).toContain('og:description');
    expect(content).toContain('og:image');
    expect(content).toContain('og:type');
    expect(content).toContain('og:url');
  });

  it('has og:locale set to fr_FR', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('og:locale');
    expect(content).toContain('fr_FR');
  });

  it('has canonical URL', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('rel="canonical"');
  });

  it('has og:site_name', () => {
    const content = readFileSync(layoutPath, 'utf-8');
    expect(content).toContain('og:site_name');
    expect(content).toContain('Elupedia');
  });
});
