import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf-8'));
}

describe('Drizzle ORM setup', () => {
  it('shared package has drizzle-orm dependency', () => {
    const pkg = readJson('packages/shared/package.json');
    expect(pkg.dependencies['drizzle-orm']).toBeDefined();
  });

  it('shared package has @neondatabase/serverless dependency', () => {
    const pkg = readJson('packages/shared/package.json');
    expect(pkg.dependencies['@neondatabase/serverless']).toBeDefined();
  });

  it('db.ts client module exists', () => {
    expect(existsSync(resolve(root, 'packages/shared/src/db.ts'))).toBe(true);
  });

  it('db.ts exports createDb', () => {
    const content = readFileSync(
      resolve(root, 'packages/shared/src/db.ts'),
      'utf-8',
    );
    expect(content).toContain('export function createDb');
  });

  it('db.ts reads DATABASE_URL', () => {
    const content = readFileSync(
      resolve(root, 'packages/shared/src/db.ts'),
      'utf-8',
    );
    expect(content).toContain('DATABASE_URL');
  });

  it('shared/src/index.ts re-exports createDb', () => {
    const content = readFileSync(
      resolve(root, 'packages/shared/src/index.ts'),
      'utf-8',
    );
    expect(content).toContain('createDb');
  });

  it('drizzle.config.ts exists at root', () => {
    expect(existsSync(resolve(root, 'drizzle.config.ts'))).toBe(true);
  });

  it('.env.example exists with DATABASE_URL', () => {
    const content = readFileSync(resolve(root, '.env.example'), 'utf-8');
    expect(content).toContain('DATABASE_URL');
  });

  it('schema directory exists', () => {
    expect(existsSync(resolve(root, 'packages/shared/src/schema'))).toBe(true);
  });
});

describe('error case', () => {
  it('createDb throws without DATABASE_URL', async () => {
    const originalEnv = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const { createDb } = await import('../packages/shared/src/db.js');
      expect(() => createDb()).toThrow('DATABASE_URL is not set');
    } finally {
      if (originalEnv !== undefined) {
        process.env.DATABASE_URL = originalEnv;
      }
    }
  });
});
