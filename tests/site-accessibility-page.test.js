import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe("Page déclaration d'accessibilité", () => {
  const pagePath = resolve(root, 'packages/site/src/pages/accessibilite.astro');
  const layoutPath = resolve(
    root,
    'packages/site/src/layouts/BaseLayout.astro',
  );

  it('accessibilite.astro exists', () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  it('states the RGAA conformance level', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('RGAA');
    expect(content).toContain('conformité partielle');
  });

  it('lists non accessible content and the remedy channel', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Contenus non accessibles');
    expect(content).toContain('Défenseur des droits');
  });

  it('is linked from the layout footer', () => {
    const layout = readFileSync(layoutPath, 'utf-8');
    expect(layout).toContain('/accessibilite');
    expect(layout).toContain('Accessibilité');
    expect(layout).toContain('fa-universal-access');
  });

  it('is listed in the static sitemap', () => {
    const sitemap = readFileSync(
      resolve(root, 'packages/site/src/pages/sitemap-static.xml.ts'),
      'utf-8',
    );
    expect(sitemap).toContain('/accessibilite');
  });
});
