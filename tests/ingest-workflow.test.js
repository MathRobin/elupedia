import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('Ingest workflow (#40)', () => {
  const wfPath = resolve(root, '.github/workflows/ingest.yml');

  it('ingest.yml exists', () => {
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

  it('runs yarn workspace ingest command', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain('yarn workspace @elupedia/ingest ingest');
  });

  it('uses Node.js 26', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain('node-version: 26');
  });
});

describe('Scrape social links workflow (#135)', () => {
  const wfPath = resolve(
    root,
    '.github/workflows/scrape-social-links.yml',
  );

  it('scrape-social-links.yml exists', () => {
    expect(existsSync(wfPath)).toBe(true);
  });

  it('has a daily cron schedule at 03:00 UTC', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain("cron: '0 3 * * *'");
  });

  it('uses DATABASE_URL secret', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain('DATABASE_URL');
  });

  it('runs scrape-social script', () => {
    const content = readFileSync(wfPath, 'utf-8');
    expect(content).toContain('scrape-social');
  });
});

describe('Ingest package script', () => {
  it('has ingest script in package.json', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(root, 'packages/ingest/package.json'), 'utf-8'),
    );
    expect(pkg.scripts.ingest).toBeDefined();
  });

  it('main.ts entry point exists', () => {
    expect(existsSync(resolve(root, 'packages/ingest/src/main.ts'))).toBe(true);
  });
});
