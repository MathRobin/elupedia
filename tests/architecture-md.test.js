import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const archMd = readFileSync(resolve(root, 'docs/ARCHITECTURE.md'), 'utf-8');

describe('docs/ARCHITECTURE.md', () => {
  it('exists', () => {
    expect(existsSync(resolve(root, 'docs/ARCHITECTURE.md'))).toBe(true);
  });

  for (const section of [
    "Vue d'ensemble",
    'Ingestion',
    'Base de données',
    'Build du site',
    'Déploiement',
  ]) {
    it(`contains section "${section}"`, () => {
      expect(archMd).toContain(section);
    });
  }

  it('contains a mermaid diagram', () => {
    expect(archMd).toContain('```mermaid');
    expect(archMd).toContain('flowchart');
  });

  it('describes the full pipeline stages', () => {
    expect(archMd).toContain('packages/ingest');
    expect(archMd).toContain('Neon');
    expect(archMd).toContain('Astro');
    expect(archMd).toContain('Vercel');
  });

  it('mentions GitHub Actions cron', () => {
    expect(archMd).toMatch(/GitHub Actions/i);
    expect(archMd).toMatch(/cron/i);
  });

  it('specifies build-only queries (no SSR)', () => {
    expect(archMd).toMatch(/au moment du build/i);
  });
});

describe('error case', () => {
  it('reading a non-existent doc throws', () => {
    expect(() =>
      readFileSync(resolve(root, 'docs/NONEXISTENT.md'), 'utf-8'),
    ).toThrow();
  });
});
