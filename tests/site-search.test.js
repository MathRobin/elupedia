import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Composant barre de recherche (#73)', () => {
  const componentPath = resolve(
    root,
    'packages/site/src/components/SearchBar.tsx',
  );
  const indexPath = resolve(root, 'packages/site/src/pages/index.astro');

  it('SearchBar.tsx exists', () => {
    expect(existsSync(componentPath)).toBe(true);
  });

  it('uses Pagefind client-side search', () => {
    const content = readFileSync(componentPath, 'utf-8');
    expect(content).toContain('pagefind');
    expect(content).toContain('.search(');
  });

  it('has accessible search input with label', () => {
    const content = readFileSync(componentPath, 'utf-8');
    expect(content).toContain('aria-label');
    expect(content).toContain('role="combobox"');
    expect(content).toContain('sr-only');
  });

  it('displays results as a listbox', () => {
    const content = readFileSync(componentPath, 'utf-8');
    expect(content).toContain('role="listbox"');
    expect(content).toContain('role="option"');
  });

  it('renders result title and excerpt', () => {
    const content = readFileSync(componentPath, 'utf-8');
    expect(content).toContain('r.meta.title');
    expect(content).toContain('r.excerpt');
    expect(content).toContain('r.url');
  });

  it('closes results on click outside', () => {
    const content = readFileSync(componentPath, 'utf-8');
    expect(content).toContain('handleClickOutside');
    expect(content).toContain('mousedown');
  });

  it('is integrated in the homepage', () => {
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('SearchBar');
    expect(content).toContain('client:load');
  });

  it('requires minimum 2 characters to search', () => {
    const content = readFileSync(componentPath, 'utf-8');
    expect(content).toContain('value.length < 2');
  });
});
