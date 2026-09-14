import { describe, it, expect } from 'vitest';
import { stripAbbreviation, planDedupe } from './dedupe-committees.js';

function row(over: Partial<Parameters<typeof planDedupe>[0][number]> = {}) {
  return {
    id: 'r1',
    officialId: 'o1',
    name: 'Commission des affaires étrangères',
    type: 'standing_committee',
    startDate: '2022-07-01',
    endDate: null,
    anUid: null,
    ...over,
  };
}

describe('stripAbbreviation', () => {
  it('removes the trailing abbreviated label', () => {
    expect(
      stripAbbreviation(
        'Commission des affaires étrangères (Affaires étrangères)',
      ),
    ).toBe('Commission des affaires étrangères');
  });

  it('handles nested parentheses', () => {
    expect(
      stripAbbreviation(
        'France République Dominicaine (Dominicaine (République))',
      ),
    ).toBe('France République Dominicaine');
  });

  it('leaves names without a trailing group untouched', () => {
    expect(stripAbbreviation('Attractivité économique et export')).toBe(
      'Attractivité économique et export',
    );
  });

  it('keeps the name when stripping would empty it', () => {
    expect(stripAbbreviation('(Amiante)')).toBe('(Amiante)');
  });
});

describe('planDedupe', () => {
  it('merges the two spellings of the same membership', () => {
    const plan = planDedupe([
      row({ id: 'a' }),
      row({
        id: 'b',
        name: 'Commission des affaires étrangères (Affaires étrangères)',
        anUid: 'PO59047',
      }),
    ]);

    expect(plan.renames).toHaveLength(0);
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0].keep).toMatchObject({
      id: 'b',
      name: 'Commission des affaires étrangères',
      anUid: 'PO59047',
    });
    expect(plan.merges[0].drop.map((r) => r.id)).toEqual(['a']);
  });

  it('keeps an ongoing membership over a closed one', () => {
    const plan = planDedupe([
      row({ id: 'a', endDate: null }),
      row({
        id: 'b',
        name: 'Commission des affaires étrangères (AE)',
        endDate: '2024-06-30',
      }),
    ]);

    expect(plan.merges[0].keep.endDate).toBeNull();
  });

  it('keeps the latest end date when every membership is closed', () => {
    const plan = planDedupe([
      row({ id: 'a', endDate: '2023-01-01' }),
      row({
        id: 'b',
        name: 'Commission des affaires étrangères (AE)',
        endDate: '2024-06-30',
      }),
    ]);

    expect(plan.merges[0].keep.endDate).toBe('2024-06-30');
  });

  it('renames a lone membership without merging it', () => {
    const plan = planDedupe([
      row({ id: 'a', name: 'Amiante (AMIANTE)', anUid: 'PO1' }),
    ]);

    expect(plan.merges).toHaveLength(0);
    expect(plan.renames).toEqual([{ id: 'a', name: 'Amiante' }]);
  });

  it('does not merge memberships of different officials or start dates', () => {
    const plan = planDedupe([
      row({ id: 'a' }),
      row({ id: 'b', officialId: 'o2' }),
      row({ id: 'c', startDate: '2024-01-01' }),
    ]);

    expect(plan.merges).toHaveLength(0);
    expect(plan.renames).toHaveLength(0);
  });
});
