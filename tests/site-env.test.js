import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');

describe("Variables d'environnement Vercel (#78)", () => {
  it('.env.example documents DATABASE_URL', () => {
    const content = readFileSync(resolve(root, '.env.example'), 'utf-8');
    expect(content).toContain('DATABASE_URL');
  });

  it('.env.example warns against PUBLIC_ prefix', () => {
    const content = readFileSync(resolve(root, '.env.example'), 'utf-8');
    expect(content).toContain('NOT prefixed with PUBLIC_');
  });

  it('.gitignore excludes .env files', () => {
    const content = readFileSync(resolve(root, '.gitignore'), 'utf-8');
    expect(content).toContain('.env');
    expect(content).toContain('!.env.example');
  });

  it('DATABASE_URL is only used via process.env (server-side)', () => {
    const dbTs = readFileSync(
      resolve(root, 'packages/shared/src/db.ts'),
      'utf-8',
    );
    expect(dbTs).toContain('process.env.DATABASE_URL');
  });

  it('no PUBLIC_DATABASE_URL anywhere in the codebase', () => {
    const result = execSync('grep -r "PUBLIC_DATABASE_URL" packages/ || true', {
      cwd: root,
      encoding: 'utf-8',
    });
    expect(result.trim()).toBe('');
  });

  it('astro config prevents DATABASE_URL leak to client bundle', () => {
    const content = readFileSync(
      resolve(root, 'packages/site/astro.config.ts'),
      'utf-8',
    );
    expect(content).toContain('import.meta.env.DATABASE_URL');
    expect(content).toContain("'undefined'");
  });
});
