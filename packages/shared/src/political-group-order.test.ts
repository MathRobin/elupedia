import { describe, it, expect } from 'vitest';
import {
  POLITICAL_GROUP_ORDER,
  politicalGroupRank,
} from './political-group-order.js';
import { POLITICAL_GROUP_COLORS } from './political-group-colors.js';

describe('politicalGroupRank', () => {
  it('orders left to right, unknown groups after, unattached last', () => {
    expect(politicalGroupRank('Gauche Démocrate et Républicaine (GDR)')).toBe(
      0,
    );
    expect(
      politicalGroupRank('Rassemblement National (RN)') >
        politicalGroupRank('Socialistes et apparentés (SOC)'),
    ).toBe(true);
    const unknown = politicalGroupRank('Groupe inconnu (XX)');
    expect(unknown).toBe(POLITICAL_GROUP_ORDER.length);
    expect(politicalGroupRank('Non inscrits (NI)')).toBeGreaterThan(unknown);
  });

  it('knows every coloured group except the unattached ones', () => {
    const missing = Object.keys(POLITICAL_GROUP_COLORS).filter(
      (name) => politicalGroupRank(name) === POLITICAL_GROUP_ORDER.length,
    );
    expect(missing).toEqual([]);
  });
});
