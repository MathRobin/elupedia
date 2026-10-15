import { describe, it, expect } from 'vitest';
import {
  POLITICAL_GROUP_ORDER,
  politicalBloc,
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

describe('politicalBloc', () => {
  it('follows the seating order: left, then centre, then right', () => {
    const blocs = POLITICAL_GROUP_ORDER.map((n) => politicalBloc(n));
    expect(blocs.every((b) => b !== null)).toBe(true);
    const an = blocs.slice(0, 11);
    // Gauche puis centre puis droite, sans retour en arrière.
    const rank = { left: 0, centre: 1, right: 2 } as const;
    const ranks = an.map((b) => rank[b!]);
    expect([...ranks].sort()).toEqual(ranks);
  });

  it('has no bloc for unattached members or unknown groups', () => {
    expect(politicalBloc('Non inscrits (NI)')).toBeNull();
    expect(politicalBloc('Groupe inconnu')).toBeNull();
  });
});
