import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

describe('README.md (#88)', () => {
  const readmePath = resolve(root, 'README.md');

  it('README.md exists', () => {
    expect(existsSync(readmePath)).toBe(true);
  });

  it('contains project description', () => {
    const content = readFileSync(readmePath, 'utf-8');
    expect(content).toContain('Encyclopédie ouverte des élus français');
  });

  it('has CI badge', () => {
    const content = readFileSync(readmePath, 'utf-8');
    expect(content).toContain('actions/workflows/ci.yml/badge.svg');
  });

  it('lists data sources', () => {
    const content = readFileSync(readmePath, 'utf-8');
    expect(content).toContain('data.assemblee-nationale.fr');
    expect(content).toContain('Licence Ouverte 2.0');
  });

  it('has installation instructions', () => {
    const content = readFileSync(readmePath, 'utf-8');
    expect(content).toContain('yarn install');
    expect(content).toContain('DATABASE_URL');
  });

  it('mentions AGPL-3.0 license', () => {
    const content = readFileSync(readmePath, 'utf-8');
    expect(content).toContain('AGPL-3.0');
  });
});
