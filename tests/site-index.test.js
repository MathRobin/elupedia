import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe("Page d'accueil — structure (#51)", () => {
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

  it('displays deputies in a grid', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('grid');
    expect(content).toContain('deputesList.map');
  });

  it('shows first name and last name', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('d.firstName');
    expect(content).toContain('d.lastName');
  });

  it('shows district', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('d.district');
  });

  it('handles error case gracefully', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('catch');
    expect(content).toContain('error');
  });

  it('uses BaseLayout', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain(
      "import BaseLayout from '../layouts/BaseLayout.astro'",
    );
    expect(content).toContain('<BaseLayout>');
  });
});

describe('Styling grille de cartes (#52)', () => {
  const indexPath = resolve(root, 'packages/site/src/pages/index.astro');

  it('displays photo or initials fallback', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('d.photoUrl');
    expect(content).toContain('<img');
    expect(content).toContain('rounded-full');
  });

  it('shows political group', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('d.politicalGroup');
  });

  it('has hover effects on cards', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('hover:');
    expect(content).toContain('transition');
  });

  it('uses lazy loading for images', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('loading="lazy"');
  });

  it('links cards to deputy detail page', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('/elus/');
    expect(content).toContain('d.id');
  });
});
