import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Ingest AN workflow', () => {
  const wfPath = resolve(root, '.github/workflows/ingest-an.yml');

  it('ingest-an.yml exists', () => {
    expect(existsSync(wfPath)).toBe(true);
  });

  it('has a cron schedule', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain('schedule');
    expect(content).toContain('cron:');
  });

  it('runs at 02:00 UTC', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain("'0 2 * * *'");
  });

  it('supports manual dispatch', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain('workflow_dispatch');
  });

  it('uses DATABASE_URL secret', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain('DATABASE_URL');
    expect(content).toContain('secrets.DATABASE_URL');
  });

  it('runs ingest:an script', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain('ingest:an');
  });

  it('uses Node.js 26', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain('node-version: 26');
  });
});

describe('Ingest Sénat workflow', () => {
  const wfPath = resolve(root, '.github/workflows/ingest-senat.yml');

  it('ingest-senat.yml exists', () => {
    expect(existsSync(wfPath)).toBe(true);
  });

  it('has a cron schedule at 03:00 UTC', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain("'0 3 * * *'");
  });

  it('supports manual dispatch', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain('workflow_dispatch');
  });

  it('uses DATABASE_URL secret', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain('secrets.DATABASE_URL');
  });

  it('runs ingest:senat script', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain('ingest:senat');
  });
});

describe('Ingest package scripts', () => {
  it('has ingest scripts in package.json', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(root, 'packages/ingest/package.json'), 'utf-8'),
    );
    expect(pkg.scripts.ingest).toBeDefined();
    expect(pkg.scripts['ingest:an']).toBeDefined();
    expect(pkg.scripts['ingest:senat']).toBeDefined();
  });

  it('main.ts entry point exists', () => {
    expect(existsSync(resolve(root, 'packages/ingest/src/main.ts'))).toBe(true);
  });

  it('main-an.ts entry point exists', () => {
    expect(existsSync(resolve(root, 'packages/ingest/src/main-an.ts'))).toBe(
      true,
    );
  });

  it('main-senat.ts entry point exists', () => {
    expect(existsSync(resolve(root, 'packages/ingest/src/main-senat.ts'))).toBe(
      true,
    );
  });
});
