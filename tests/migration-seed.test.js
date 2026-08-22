import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf-8'));
}

describe('migration initiale (#19)', () => {
  it('drizzle/ directory exists with migration files', () => {
    const drizzleDir = resolve(root, 'drizzle');
    expect(existsSync(drizzleDir)).toBe(true);
    const files = readdirSync(drizzleDir);
    const sqlFiles = files.filter((f) => f.endsWith('.sql'));
    expect(sqlFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('initial migration creates all 13 tables', () => {
    const drizzleDir = resolve(root, 'drizzle');
    const files = readdirSync(drizzleDir).filter((f) => f.endsWith('.sql'));
    const sql = readFileSync(resolve(drizzleDir, files[0]), 'utf-8');
    const tables = [
      'officials',
      'mandates',
      'ballots',
      'votes',
      'staffers',
      'affiliations',
      'interests',
      'addresses',
      'external_links',
      'press_mentions',
      'parliamentary_activity',
      'committees',
      'electoral_results',
    ];
    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE "` + table + `"`);
    }
  });

  it('seed script exists', () => {
    expect(existsSync(resolve(root, 'packages/shared/src/seed.ts'))).toBe(true);
  });

  it('seed script inserts test officials', () => {
    const content = readFileSync(
      resolve(root, 'packages/shared/src/seed.ts'),
      'utf-8',
    );
    expect(content).toContain('Dupont');
    expect(content).toContain('Martin');
    expect(content).toContain('Leroy');
  });

  it('db:migrate script is defined', () => {
    const pkg = readJson('package.json');
    expect(pkg.scripts['db:migrate']).toBeDefined();
  });

  it('db:seed script is defined', () => {
    const pkg = readJson('package.json');
    expect(pkg.scripts['db:seed']).toBeDefined();
  });
});

describe('error case', () => {
  it('reading non-existent migration throws', () => {
    expect(() =>
      readFileSync(resolve(root, 'drizzle/nonexistent.sql'), 'utf-8'),
    ).toThrow();
  });
});
