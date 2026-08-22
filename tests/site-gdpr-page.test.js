import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Page données personnelles / RGPD (#69)', () => {
  const pagePath = resolve(
    root,
    'packages/site/src/pages/donnees-personnelles.astro',
  );

  it('donnees-personnelles.astro exists', () => {
    expect(existsSync(pagePath)).toBe(true);
  });

  it('uses BaseLayout with title', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('<BaseLayout');
    expect(content).toContain('Données personnelles');
  });

  it('explains what data is published', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('sources officielles ouvertes');
    expect(content).toContain('transparence démocratique');
  });

  it('lists GDPR rights', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain("Droit d'accès");
    expect(content).toContain('Droit de rectification');
    expect(content).toContain("Droit d'opposition");
    expect(content).toContain("Droit à l'effacement");
    expect(content).toContain('Droit à la limitation');
  });

  it('provides contact email for exercising rights', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('rgpd@elupedia.fr');
    expect(content).toContain('mailto:rgpd@elupedia.fr');
  });

  it('mentions CNIL for complaints', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('CNIL');
    expect(content).toContain('cnil.fr');
  });

  it('mentions legal basis (legitimate interest)', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('intérêt légitime');
    expect(content).toContain('article 6.1.f');
  });

  it('mentions cookies and tarteaucitron', () => {
    const content = readFileSync(pagePath, 'utf-8');
    expect(content).toContain('tarteaucitron');
    expect(content).toContain('Aucun cookie publicitaire');
  });
});
