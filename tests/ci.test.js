import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('CI GitHub Actions (#21)', () => {
  const ciPath = resolve(root, '.github/workflows/ci.yml');

  it('ci.yml exists', () => {
    expect(existsSync(ciPath)).toBe(true);
  });

  it('triggers on pull_request', () => {
    const content = readFileSync(ciPath, 'utf-8');
    expect(content).toContain('pull_request');
  });

  it('runs lint step', () => {
    const content = readFileSync(ciPath, 'utf-8');
    expect(content).toContain('yarn lint');
  });

  it('runs typecheck step', () => {
    const content = readFileSync(ciPath, 'utf-8');
    expect(content).toContain('yarn typecheck');
  });

  it('runs test step', () => {
    const content = readFileSync(ciPath, 'utf-8');
    expect(content).toContain('yarn test');
  });

  it('uses Node.js 26', () => {
    const content = readFileSync(ciPath, 'utf-8');
    expect(content).toContain('node-version: 26');
  });
});

describe('Dependabot (#22)', () => {
  const depPath = resolve(root, '.github/dependabot.yml');

  it('dependabot.yml exists', () => {
    expect(existsSync(depPath)).toBe(true);
  });

  it('monitors npm ecosystem', () => {
    const content = readFileSync(depPath, 'utf-8');
    expect(content).toContain('package-ecosystem: npm');
  });

  it('uses weekly schedule', () => {
    const content = readFileSync(depPath, 'utf-8');
    expect(content).toContain('interval: weekly');
  });
});

describe('error case', () => {
  it('reading non-existent workflow throws', () => {
    expect(() =>
      readFileSync(resolve(root, '.github/workflows/nonexistent.yml'), 'utf-8'),
    ).toThrow();
  });
});
