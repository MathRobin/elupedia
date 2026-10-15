import { describe, it, expect } from 'vitest';
import { buildBallotFacts } from './script-facts.js';

const group = (
  groupName: string,
  position: string,
  votes: { f: number; c: number; a: number },
) => ({
  groupName,
  memberCount: 40,
  position,
  votesFor: votes.f,
  votesAgainst: votes.c,
  votesAbstain: votes.a,
  votesAbsent: 0,
});

const base = {
  id: 'b',
  anId: 'scrutin-VTANR5L17V1',
  title: 'le texte',
  date: '2026-10-08',
  type: 'scrutin public ordinaire',
  result: 'rejected',
  counts: { for: 100, against: 150, abstain: 0, absent: 0 },
};

describe('blocs', () => {
  it('reports a common position when every group of a side votes the same', () => {
    const b = buildBallotFacts({
      ...base,
      groups: [
        group('Socialistes et apparentés (SOC)', 'pour', { f: 30, c: 0, a: 0 }),
        group('Écologiste et Social (EcoS)', 'pour', { f: 30, c: 0, a: 0 }),
        group('Droite Républicaine (DR)', 'contre', { f: 0, c: 30, a: 0 }),
        group('Rassemblement National (RN)', 'pour', { f: 30, c: 0, a: 0 }),
        group('Ensemble pour la République (EPR)', 'contre', {
          f: 0,
          c: 30,
          a: 0,
        }),
      ],
    });
    expect(b.blocs.left).toEqual({
      groups: ['Socialistes et apparentés', 'Écologiste et Social'],
      unanimousPosition: 'pour',
    });
    // DR contre, RN pour : le côté droit est partagé ; le centre (EPR) n'y compte pas.
    expect(b.blocs.right?.unanimousPosition).toBeNull();
    expect(b.blocs.right?.groups).toHaveLength(2);
  });

  it('has no bloc when fewer than two groups sit on that side', () => {
    const b = buildBallotFacts({
      ...base,
      groups: [
        group('Socialistes et apparentés (SOC)', 'pour', { f: 30, c: 0, a: 0 }),
        group('Rassemblement National (RN)', 'pour', { f: 30, c: 0, a: 0 }),
      ],
    });
    expect(b.blocs).toEqual({ left: null, right: null });
  });
});
