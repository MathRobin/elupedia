import { describe, it, expect, vi } from 'vitest';
import { parseCliArgs, STEP_NAMES } from './cli.js';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('parseCliArgs', () => {
  it('returns all steps when no flags', () => {
    const result = parseCliArgs([]);
    expect(result).toEqual(new Set(STEP_NAMES));
  });

  it('returns null on --help', () => {
    const result = parseCliArgs(['--help']);
    expect(result).toBeNull();
  });

  it('filters with --only', () => {
    const result = parseCliArgs(['--only', 'officials,interests']);
    expect(result).toEqual(new Set(['officials', 'interests']));
  });

  it('excludes with --skip', () => {
    const result = parseCliArgs(['--skip', 'interests']);
    const expected = new Set(STEP_NAMES.filter((s) => s !== 'interests'));
    expect(result).toEqual(expected);
  });

  it('throws on --only + --skip', () => {
    expect(() =>
      parseCliArgs(['--only', 'officials', '--skip', 'interests']),
    ).toThrow('mutuellement exclusifs');
  });

  it('throws on unknown step', () => {
    expect(() => parseCliArgs(['--only', 'unknown'])).toThrow(
      'Étape inconnue',
    );
  });
});
