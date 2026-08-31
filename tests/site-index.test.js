import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe("Page d'accueil — landing page (M15T1)", () => {
  const indexPath = resolve(root, 'packages/site/src/pages/index.astro');

  it('index.astro exists', () => {
    expect(existsSync(indexPath)).toBe(true);
  });

  it('imports getDb for build-time query', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('getDb');
  });

  it('queries officials and mandates', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('officials');
    expect(content).toContain('mandates');
  });

  it('uses BaseLayout', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain(
      "import BaseLayout from '../layouts/BaseLayout.astro'",
    );
    expect(content).toContain('<BaseLayout');
  });

  it('has hero section with search', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('HeroSearch');
  });

  it('has CTA links to /elus and /votes', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('href="/elus"');
    expect(content).toContain('href="/votes"');
  });

  it('has feature cards section', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('Fiches Députés');
    expect(content).toContain('Analyse des Votes');
    expect(content).toContain('Transparence');
  });

  it('has engagement section', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('Transparence radicale');
    expect(content).toContain('Neutralité absolue');
  });
});

describe('Styling grille de cartes (#52)', () => {
  const listPath = resolve(
    root,
    'packages/site/src/components/OfficialsList.tsx',
  );

  it('displays photo or initials fallback', () => {
    const content = readFileSync(listPath, 'utf-8');
    expect(content).toContain('d.photoUrl');
    expect(content).toContain('<img');
    expect(content).toContain('rounded-full');
  });

  it('shows political group', () => {
    const content = readFileSync(listPath, 'utf-8');
    expect(content).toContain('d.politicalGroup');
  });

  it('has hover effects on cards', () => {
    const content = readFileSync(listPath, 'utf-8');
    expect(content).toContain('hover:');
    expect(content).toContain('transition');
  });

  it('uses lazy loading for images', () => {
    const content = readFileSync(listPath, 'utf-8');
    expect(content).toContain('loading="lazy"');
  });

  it('links cards to official detail page', () => {
    const content = readFileSync(listPath, 'utf-8');
    expect(content).toContain('/elus/');
    expect(content).toContain('d.id');
  });
});
