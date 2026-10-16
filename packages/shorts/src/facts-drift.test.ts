import { describe, it, expect } from 'vitest';
import { factsDrift, formatDrift } from './facts-drift.js';
import { buildBallotFacts } from './script-facts.js';

const make = (forVotes: number, result: string) => ({
  shortId: 's',
  ballots: [
    buildBallotFacts({
      id: 'b1',
      anId: 'scrutin-VTANR5L17V1',
      title: 't',
      date: '2026-10-08',
      type: 'scrutin public ordinaire',
      result,
      counts: { for: forVotes, against: 199, abstain: 5, absent: 2 },
      groups: [
        {
          groupName: 'Rassemblement National (RN)',
          memberCount: 574,
          position: 'for',
          votesFor: 118,
          votesAgainst: 0,
          votesAbstain: 0,
          votesAbsent: 0,
        },
      ],
    }),
  ],
});

describe('factsDrift', () => {
  it('is empty when nothing the video states has changed', () => {
    expect(factsDrift(make(141, 'rejected'), make(141, 'rejected'))).toEqual(
      [],
    );
  });

  it('reports changed counts and the figures that derive from them', () => {
    const drift = factsDrift(make(141, 'rejected'), make(144, 'rejected'));
    expect(drift.map((d) => d.field)).toEqual([
      'counts.for',
      'counts.notVoting',
    ]);
    expect(formatDrift(drift)).toContain('counts.for : script 141 → base 144');
  });

  it('reports a changed result and a vanished ballot', () => {
    expect(
      factsDrift(make(141, 'rejected'), make(141, 'adopted'))[0].field,
    ).toBe('result');
    const gone = factsDrift(make(141, 'rejected'), {
      shortId: 's',
      ballots: [],
    });
    expect(gone[0].field).toBe('ballot');
  });
});
