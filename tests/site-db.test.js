import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Site DB connection (#50)', () => {
  const dbPath = resolve(root, 'packages/site/src/lib/db.ts');
  const configPath = resolve(root, 'packages/site/astro.config.ts');
  const pkgPath = resolve(root, 'packages/site/package.json');

  it('db.ts exists', () => {
    expect(existsSync(dbPath)).toBe(true);
  });

  it('imports createDb from @elupedia/shared', () => {
    const content = readFileSync(dbPath, 'utf-8');
    expect(content).toContain("from '@elupedia/shared'");
    expect(content).toContain('createDb');
  });

  it('exports getDb function', () => {
    const content = readFileSync(dbPath, 'utf-8');
    expect(content).toContain('export function getDb');
  });

  it('uses singleton pattern', () => {
    const content = readFileSync(dbPath, 'utf-8');
    expect(content).toMatch(/let\s+_db/);
    expect(content).toContain('if (!_db)');
  });

  it('site depends on @elupedia/shared', () => {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    expect(pkg.dependencies['@elupedia/shared']).toBeDefined();
  });

  it('astro config uses static output', () => {
    const content = readFileSync(configPath, 'utf-8');
    expect(content).toContain("output: 'static'");
  });
});
