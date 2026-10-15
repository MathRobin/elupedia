import { describe, it, expect, vi } from 'vitest';
import {
  type BallotForScoring,
  chamberOf,
  rankBallots,
  scoreBallot,
  scoreSubject,
} from './select-candidates.js';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function ballot(over: Partial<BallotForScoring> = {}): BallotForScoring {
  return {
    id: 'b1',
    anId: 'scrutin-VTANR5L17V1',
    title: "l'ensemble du projet de loi de finances pour 2027",
    date: '2026-10-08',
    type: 'scrutin public solennel',
    result: 'adopted',
    counts: { for: 280, against: 260, abstain: 10, absent: 27 },
    groups: [],
    ...over,
  };
}

describe('scoreSubject', () => {
  it('ranks subjects from the title', () => {
    expect(scoreSubject('la motion de censure déposée…').points).toBe(50);
    expect(
      scoreSubject("l'ensemble du projet de loi agricole (première lecture)")
        .points,
    ).toBe(40);
    expect(scoreSubject("sur l'ensemble du texte").points).toBe(40);
    expect(
      scoreSubject("l'article 2 de la proposition de loi organique").points,
    ).toBe(10);
    expect(scoreSubject("l'amendement n° 386 du Gouvernement").points).toBe(0);
    expect(
      scoreSubject("le sous-amendement n° 1341 à l'amendement n° 453").points,
    ).toBe(-5);
  });

  it('recognises resolutions and confidence votes without false positives', () => {
    expect(
      scoreSubject(
        "la proposition de résolution visant à refonder l'espace Schengen (article 34-1 de la Constitution)",
      ).label,
    ).toBe('proposition de résolution');
    expect(
      scoreSubject(
        "l'amendement n° 404 du Gouvernement à l'article 49 (examen prioritaire) de la proposition de loi",
      ).label,
    ).toBe('amendement');
    expect(
      scoreSubject(
        "la motion de censure déposée en application de l'article 49, alinéa 3, de la Constitution",
      ).label,
    ).toBe('motion de censure');
    expect(
      scoreSubject('la déclaration du Gouvernement sur la politique générale')
        .points,
    ).toBe(45);
  });

  it("does not confuse an amendment mentioning 'ensemble' with a final vote", () => {
    // « l'ensemble » n'apparaît pas sous la forme « l'ensemble du projet ».
    expect(
      scoreSubject(
        "l'amendement n° 12 visant à supprimer l'ensemble des dispositions de l'article 3",
      ).label,
    ).toBe('amendement');
  });
});

describe('scoreBallot', () => {
  it('rewards a solemn, close, well-attended final vote', () => {
    const d = scoreBallot(ballot());
    expect(d.subject.points).toBe(40);
    expect(d.ballotType.points).toBe(15);
    // 550 exprimés / 577 sièges
    expect(d.participation.points).toBe(19);
    // marge 20/540 ≈ 3,7 % → 19 points
    expect(d.closeness.points).toBe(19);
    expect(d.division.points).toBe(0);
    expect(d.total).toBe(93);
  });

  it('scores an ordinary amendment with few voters low', () => {
    const d = scoreBallot(
      ballot({
        title: "l'amendement n° 462 de Mme Leboucher à l'article 46",
        type: 'scrutin public ordinaire',
        counts: { for: 80, against: 40, abstain: 2, absent: 5 },
        groups: [
          {
            groupName: 'X',
            memberCount: 577,
            votesFor: 80,
            votesAgainst: 40,
            votesAbstain: 2,
          },
        ],
      }),
    );
    expect(d.subject.points).toBe(0);
    expect(d.participation.points).toBe(4);
    // 122 votants exprimés : l'écart est pondéré à 122/150.
    expect(d.closeness.points).toBe(11);
    expect(d.total).toBeLessThan(30);
  });

  it('uses group member counts as chamber size when available', () => {
    const d = scoreBallot(
      ballot({
        counts: { for: 100, against: 100, abstain: 0, absent: 0 },
        groups: [
          {
            groupName: 'A',
            memberCount: 200,
            votesFor: 100,
            votesAgainst: 0,
            votesAbstain: 0,
          },
          {
            groupName: 'B',
            memberCount: 200,
            votesFor: 0,
            votesAgainst: 100,
            votesAbstain: 0,
          },
        ],
      }),
    );
    expect(d.participation.ratio).toBe(0.5);
    expect(d.participation.points).toBe(10);
    expect(d.closeness.points).toBe(20);
  });

  it('detects the most divided group and ignores tiny groups', () => {
    const d = scoreBallot(
      ballot({
        groups: [
          {
            groupName: 'Petit',
            memberCount: 5,
            votesFor: 2,
            votesAgainst: 3,
            votesAbstain: 0,
          },
          {
            groupName: 'Uni',
            memberCount: 100,
            votesFor: 95,
            votesAgainst: 0,
            votesAbstain: 0,
          },
          {
            groupName: 'Divisé',
            memberCount: 60,
            votesFor: 30,
            votesAgainst: 20,
            votesAbstain: 10,
          },
        ],
      }),
    );
    expect(d.division.group).toBe('Divisé');
    expect(d.division.minorityShare).toBe(0.5);
    expect(d.division.points).toBe(15);
  });

  it('does not reward a tie between a handful of voters', () => {
    const d = scoreBallot(
      ballot({
        counts: { for: 15, against: 15, abstain: 0, absent: 0 },
        groups: [],
      }),
    );
    expect(d.closeness.margin).toBe(0);
    expect(d.closeness.points).toBe(4);
  });

  it('falls back to the Senate size when nothing else is known', () => {
    const d = scoreBallot(
      ballot({
        anId: 'senat-scrutin-2026-12',
        type: 'ordinaire',
        counts: { for: 0, against: 0, abstain: 0, absent: 0 },
      }),
    );
    expect(chamberOf(d && 'senat-scrutin-2026-12')).toBe('senat');
    expect(d.participation.points).toBe(0);
    expect(d.closeness.margin).toBeNull();
    expect(d.closeness.points).toBe(0);
  });
});

describe('rankBallots', () => {
  it('sorts by score then by most recent date, and flags used ballots', () => {
    const a = ballot({ id: 'a', date: '2026-10-01' });
    const b = ballot({ id: 'b', date: '2026-10-08' });
    const c = ballot({
      id: 'c',
      title: "l'amendement n° 1",
      type: 'scrutin public ordinaire',
    });
    const ranked = rankBallots([c, a, b], new Set(['a']));
    expect(ranked.map((r) => r.ballot.id)).toEqual(['b', 'a', 'c']);
    expect(ranked[1].alreadyUsed).toBe(true);
    expect(ranked[0].alreadyUsed).toBe(false);
  });
});
