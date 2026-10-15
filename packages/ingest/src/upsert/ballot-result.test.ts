import { describe, it, expect } from 'vitest';
import { normalizeBallotResult } from './ballot-result.js';

describe('normalizeBallotResult', () => {
  it('maps AN sort codes', () => {
    expect(normalizeBallotResult('adopté')).toBe('adopted');
    expect(normalizeBallotResult('rejeté')).toBe('rejected');
  });

  it('maps Sénat index suffixes', () => {
    expect(normalizeBallotResult('Adoption')).toBe('adopted');
    expect(normalizeBallotResult('Rejet')).toBe('rejected');
  });

  it('returns null when unknown or empty', () => {
    expect(normalizeBallotResult('')).toBeNull();
    expect(normalizeBallotResult(undefined)).toBeNull();
    expect(normalizeBallotResult('n/a')).toBeNull();
  });
});
