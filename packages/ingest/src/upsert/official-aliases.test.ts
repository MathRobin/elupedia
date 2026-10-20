import { describe, it, expect, vi } from 'vitest';
import { applyOfficialAliases } from './official-aliases.js';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('applyOfficialAliases', () => {
  it('redirects an alias key to the target official', () => {
    const index = new Map<string, string>([['jean|dupont|1970-01-01', 'a']]);
    const applied = applyOfficialAliases(
      index,
      new Map([['jean|dupont|1980-01-01', 'a']]),
      (id) => (id === 'a' ? id : undefined),
    );
    expect(applied).toBe(1);
    expect(index.get('jean|dupont|1980-01-01')).toBe('a');
  });

  it('lets the alias win over a recreated duplicate and ignores unknown targets', () => {
    const index = new Map<string, string>([['jean|dupont|1980-01-01', 'dup']]);
    const applied = applyOfficialAliases(
      index,
      new Map([
        ['jean|dupont|1980-01-01', 'a'],
        ['x|y|', 'ghost'],
      ]),
      (id) => (id === 'a' ? id : undefined),
    );
    expect(applied).toBe(1);
    expect(index.get('jean|dupont|1980-01-01')).toBe('a');
    expect(index.has('x|y|')).toBe(false);
  });
});
