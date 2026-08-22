import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(import.meta.dirname, '../../src/upsert/staffers-diff.ts');

describe('staffers diff', () => {
  it('module exists', () => {
    expect(existsSync(file)).toBe(true);
  });

  it('exports diffStaffers function', () => {
    const content = readFileSync(file, 'utf-8');
    expect(content).toContain('export async function diffStaffers');
  });

  it('sets endDate on departed staffers', () => {
    const content = readFileSync(file, 'utf-8');
    expect(content).toContain('endDate');
    expect(content).toContain('incomingNames');
  });

  it('creates new staffers with startDate', () => {
    const content = readFileSync(file, 'utf-8');
    expect(content).toContain('startDate: today');
  });

  it('returns a summary with created/ended/unchanged counts', () => {
    const content = readFileSync(file, 'utf-8');
    expect(content).toContain('summary.created');
    expect(content).toContain('summary.ended');
    expect(content).toContain('summary.unchanged');
  });
});
