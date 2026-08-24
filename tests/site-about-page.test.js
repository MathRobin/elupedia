import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Page À propos (#68)', () => {
  const pagePath = resolve(root, 'packages/site/src/pages/a-propos.astro');

  it('a-propos.astro exists', () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  it('uses BaseLayout with title', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('<BaseLayout');
    expect(content).toContain('title="À propos"');
  });

  it('contains project description', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('annuaire indépendant et open source');
    expect(content).toContain('élus français');
  });

  it('describes transparency pillar', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('transparence radicale');
    expect(content).toContain('Gestion des erreurs');
  });

  it('describes neutrality pillar', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('neutralité absolue');
    expect(content).toContain("outil d'observation");
  });

  it('describes independence and funding model', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Gratuité totale');
    expect(content).toContain('Financement autonome');
    expect(content).toContain('aucune publicité');
  });

  it('mentions contribution section', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Contribuer au projet');
    expect(content).toContain('code source est entièrement public');
    expect(content).toContain('GitHub');
  });

  it('mentions roadmap', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Feuille de route');
    expect(content).toContain('députés et sénateurs français');
  });
});
