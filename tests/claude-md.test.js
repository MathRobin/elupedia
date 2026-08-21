import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const claudeMd = readFileSync(resolve(root, 'CLAUDE.md'), 'utf-8');

describe('CLAUDE.md', () => {
  it('exists at repo root', () => {
    expect(existsSync(resolve(root, 'CLAUDE.md'))).toBe(true);
  });

  for (const section of [
    'Stack',
    'Structure du monorepo',
    'Conventions base de données',
    'Commandes',
    'Documentation',
  ]) {
    it(`contains section "${section}"`, () => {
      expect(claudeMd).toContain(`## ${section}`);
    });
  }

  it('mentions the tech stack components', () => {
    expect(claudeMd).toContain('Astro');
    expect(claudeMd).toContain('React');
    expect(claudeMd).toContain('Tailwind');
    expect(claudeMd).toContain('Neon');
    expect(claudeMd).toContain('Drizzle');
    expect(claudeMd).toContain('Yarn');
  });

  it('documents snake_case convention in English', () => {
    expect(claudeMd).toMatch(/anglais/i);
    expect(claudeMd).toContain('snake_case');
  });

  it('references docs/ directory', () => {
    expect(claudeMd).toContain('docs/');
  });

  it('lists key commands', () => {
    expect(claudeMd).toContain('yarn lint');
    expect(claudeMd).toContain('yarn test');
    expect(claudeMd).toContain('yarn typecheck');
  });
});

describe('CLAUDE.md error case', () => {
  it('reading a non-existent md file throws', () => {
    expect(() =>
      readFileSync(resolve(root, 'NONEXISTENT.md'), 'utf-8'),
    ).toThrow();
  });
});
