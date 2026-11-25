import { describe, it, expect, vi } from 'vitest';
import {
  type BallotForScoring,
  chamberOf,
  chooseCandidates,
  freshnessFloorDate,
  maxAgeHours,
  rankBallots,
  scoreBallot,
  scoreBonuses,
  scoreSubject,
  thresholdLadder,
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
    // + 15 : vote sur l'ensemble d'un projet de loi de finances.
    expect(d.bonuses.map((b) => b.points)).toEqual([15]);
    expect(d.total).toBe(108);
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

describe('scoreBonuses', () => {
  const labels = (b: BallotForScoring) => scoreBonuses(b).map((x) => x.label);
  const points = (b: BallotForScoring) =>
    scoreBonuses(b).reduce((n, x) => n + x.points, 0);

  it('gives nothing to an ordinary ballot', () => {
    expect(
      scoreBonuses(
        ballot({
          title: "l'amendement n° 12 à l'article 3 de la proposition de loi",
          counts: { for: 80, against: 40, abstain: 2, absent: 10 },
        }),
      ),
    ).toEqual([]);
  });

  it('rewards a margin of a few votes, more when it is two or fewer', () => {
    const base = {
      title: "l'amendement n° 12 à l'article 3 de la proposition de loi",
    };
    // 25 contre 23 : le ratio d'écart sature, l'écart absolu non.
    expect(
      points(
        ballot({
          ...base,
          counts: { for: 25, against: 23, abstain: 0, absent: 0 },
        }),
      ),
    ).toBe(15);
    expect(
      points(
        ballot({
          ...base,
          counts: { for: 30, against: 26, abstain: 0, absent: 0 },
        }),
      ),
    ).toBe(10);
    expect(
      points(
        ballot({
          ...base,
          counts: { for: 40, against: 20, abstain: 0, absent: 0 },
        }),
      ),
    ).toBe(0);
  });

  it('names a tie as such', () => {
    expect(
      labels(
        ballot({
          title: "l'amendement n° 12 à l'article 3 de la proposition de loi",
          counts: { for: 24, against: 24, abstain: 0, absent: 0 },
        }),
      ),
    ).toEqual(['égalité des voix']);
  });

  it('flags the Gouvernement beaten on its own amendment', () => {
    const rejete = ballot({
      title: "l'amendement n° 386 du Gouvernement à l'article 2",
      result: 'rejected',
      counts: { for: 100, against: 180, abstain: 0, absent: 0 },
    });
    expect(labels(rejete)).toEqual(['amendement du Gouvernement rejeté']);
    // Adopté : rien, le Gouvernement n'est pas mis en minorité.
    expect(scoreBonuses({ ...rejete, result: 'adopted' })).toEqual([]);
  });

  it('rewards unanimity only once the chamber showed up', () => {
    const unanime = (f: number) =>
      ballot({
        title: "l'ensemble de la proposition de loi sur les sapeurs-pompiers",
        counts: { for: f, against: 0, abstain: 0, absent: 0 },
      });
    expect(points(unanime(120))).toBe(10);
    // Sous le seuil : séance clairsemée, pas un accord de l'assemblée.
    expect(scoreBonuses(unanime(40))).toEqual([]);
  });

  it('rewards the final vote on a budget bill, not its amendments', () => {
    expect(
      labels(
        ballot({
          title:
            "l'ensemble du projet de loi de financement de la sécurité sociale pour 2027",
          counts: { for: 280, against: 260, abstain: 0, absent: 0 },
        }),
      ),
    ).toEqual(["ensemble d'un texte budgétaire"]);
    expect(
      scoreBonuses(
        ballot({
          title:
            "l'amendement n° 12 à l'article 3 du projet de loi de finances pour 2027",
          counts: { for: 280, against: 240, abstain: 0, absent: 0 },
        }),
      ),
    ).toEqual([]);
  });

  it('adds up when several criteria apply', () => {
    const d = scoreBallot(
      ballot({
        title: "l'ensemble du projet de loi de finances pour 2027",
        counts: { for: 271, against: 270, abstain: 0, absent: 36 },
      }),
    );
    // Écart d'une voix (15) + ensemble d'un texte budgétaire (15).
    expect(d.bonuses.map((b) => b.points)).toEqual([15, 15]);
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

describe('thresholdLadder', () => {
  it('descends by steps of ten down to the floor', () => {
    expect(thresholdLadder(50, 0)).toEqual([50, 40, 30, 20, 10, 0]);
  });

  it('starts below the requested score even when it is not a multiple of ten', () => {
    // 45 demandé : le palier suivant est 40, pas 45 une seconde fois.
    expect(thresholdLadder(45, 0)).toEqual([45, 40, 30, 20, 10, 0]);
  });

  it('stops at the floor without going under', () => {
    expect(thresholdLadder(50, 25)).toEqual([50, 40, 30, 25]);
  });

  it('gives a single rung when the floor disables the descent', () => {
    expect(thresholdLadder(50, 50)).toEqual([50]);
    expect(thresholdLadder(50, 80)).toEqual([50]);
  });
});

describe('chooseCandidates', () => {
  // Les paliers dégradés exigent un scrutin encore d'actualité, d'autant plus
  // longtemps qu'il est noté (maxAgeHours) : « now » est fixé au lendemain du
  // scrutin de référence (2026-10-08).
  const options = {
    minScore: 50,
    minScoreFloor: 0,
    maxShorts: 2,
    now: new Date('2026-10-09T16:10:00Z'),
  };

  it('takes up to maxShorts at the requested threshold', () => {
    const ranked = rankBallots(
      [ballot({ id: 'a' }), ballot({ id: 'b' }), ballot({ id: 'c' })],
      new Set(),
    );
    const { chosen, applied } = chooseCandidates(ranked, options);
    expect(applied).toBe(50);
    expect(chosen.map((r) => r.ballot.id)).toEqual(['a', 'b']);
  });

  it('lowers the threshold and keeps a single ballot when nothing reaches it', () => {
    // Deux amendements : le cas qui laissait le DAG sans short à scripter.
    const faibles = [
      ballot({
        id: 'faible1',
        title: "l'amendement n° 1",
        type: 'scrutin public ordinaire',
        counts: { for: 30, against: 25, abstain: 2, absent: 520 },
      }),
      ballot({
        id: 'faible2',
        title: "l'amendement n° 2",
        type: 'scrutin public ordinaire',
        counts: { for: 20, against: 18, abstain: 1, absent: 538 },
      }),
    ];
    const ranked = rankBallots(faibles, new Set());
    expect(ranked[0].details.total).toBeLessThan(50);

    const { chosen, applied } = chooseCandidates(ranked, options);
    expect(applied).toBeLessThan(50);
    expect(chosen).toHaveLength(1);
    expect(chosen[0].ballot.id).toBe(ranked[0].ballot.id);
    expect(ranked[0].details.total).toBeGreaterThanOrEqual(applied);
  });

  // Un scrutin anecdotique ne se raconte que tant qu'il est d'actualité :
  // à 19 points, la limite reste 36 h et la journée se passe de vidéo.
  it('refuses a low-scoring ballot older than 36 h at a degraded threshold', () => {
    const faible = ballot({
      id: 'faible',
      title: "l'amendement n° 1",
      type: 'scrutin public ordinaire',
      counts: { for: 30, against: 25, abstain: 2, absent: 520 },
    });
    const ranked = rankBallots([faible], new Set());
    expect(ranked[0].details.total).toBeLessThan(50);

    // Scrutin du 8 au matin, exécution du 10 à 16 h 10 : plus de 36 h.
    expect(
      chooseCandidates(ranked, {
        ...options,
        now: new Date('2026-10-10T16:10:00Z'),
      }).chosen,
    ).toEqual([]);
    // Le lendemain, il passe encore.
    expect(chooseCandidates(ranked, options).chosen).toHaveLength(1);
  });

  // Le seuil nominal n'est pas concerné : un vote marquant reste racontable
  // sur toute la fenêtre « days ».
  it('keeps an old ballot that reaches the requested threshold', () => {
    const ranked = rankBallots([ballot({ id: 'fort' })], new Set());
    expect(ranked[0].details.total).toBeGreaterThanOrEqual(50);
    const { chosen, applied } = chooseCandidates(ranked, {
      ...options,
      now: new Date('2026-10-15T16:10:00Z'),
    });
    expect(applied).toBe(50);
    expect(chosen.map((r) => r.ballot.id)).toEqual(['fort']);
  });

  it('never picks a ballot already covered by a short', () => {
    const ranked = rankBallots([ballot({ id: 'deja' })], new Set(['deja']));
    expect(chooseCandidates(ranked, options).chosen).toEqual([]);
  });

  it('picks nothing when the floor equals the requested score', () => {
    const ranked = rankBallots(
      [
        ballot({
          id: 'faible',
          title: "l'amendement n° 1",
          type: 'scrutin public ordinaire',
          counts: { for: 30, against: 25, abstain: 2, absent: 520 },
        }),
      ],
      new Set(),
    );
    const { chosen, applied } = chooseCandidates(ranked, {
      ...options,
      minScoreFloor: 50,
    });
    expect(chosen).toEqual([]);
    expect(applied).toBe(50);
  });

  it('picks nothing when there is no ballot at all', () => {
    expect(chooseCandidates([], options).chosen).toEqual([]);
  });

  // Le cas qui a laissé deux journées sans vidéo (23 et 24/11/2026) : un
  // article de loi à 48 points, libre, écarté par l'ancienne limite unique de
  // 36 h. À ce score il tient maintenant cinq jours.
  it('keeps a 40+ ballot for five days at a degraded threshold', () => {
    const article = ballot({
      id: 'article',
      title:
        "l'article premier de la proposition de loi sur les rapports locatifs",
      type: 'scrutin public ordinaire',
    });
    const ranked = rankBallots([article], new Set());
    expect(ranked[0].details.total).toBe(48);

    // Quatre jours après le scrutin : repris, au palier 40.
    const { chosen, applied } = chooseCandidates(ranked, {
      ...options,
      now: new Date('2026-10-12T16:10:00Z'),
    });
    expect(applied).toBe(40);
    expect(chosen.map((r) => r.ballot.id)).toEqual(['article']);

    // Six jours après : trop vieux même pour son score.
    expect(
      chooseCandidates(ranked, {
        ...options,
        now: new Date('2026-10-14T16:10:00Z'),
      }).chosen,
    ).toEqual([]);
  });

  // La limite se lit scrutin par scrutin, pas une fois pour le palier : un
  // amendement d'il y a quatre jours ne passe pas parce qu'un article du même
  // palier passe.
  it('applies the age limit per ballot, not per threshold', () => {
    const ranked = rankBallots(
      [
        ballot({
          id: 'article',
          title:
            "l'article premier de la proposition de loi sur les rapports locatifs",
          type: 'scrutin public ordinaire',
        }),
        ballot({
          id: 'amendement',
          title: "l'amendement n° 1",
          type: 'scrutin public ordinaire',
          counts: { for: 30, against: 25, abstain: 2, absent: 520 },
        }),
      ],
      new Set(),
    );
    const { chosen } = chooseCandidates(ranked, {
      ...options,
      now: new Date('2026-10-12T16:10:00Z'),
    });
    expect(chosen.map((r) => r.ballot.id)).toEqual(['article']);
  });
});

describe('maxAgeHours', () => {
  it('loosens the age limit as the score rises', () => {
    expect(maxAgeHours(79)).toBe(120);
    expect(maxAgeHours(48)).toBe(120);
    expect(maxAgeHours(40)).toBe(120);
    expect(maxAgeHours(39)).toBe(72);
    expect(maxAgeHours(30)).toBe(72);
    expect(maxAgeHours(29)).toBe(36);
    expect(maxAgeHours(0)).toBe(36);
  });
});

describe('freshnessFloorDate', () => {
  // `ballots.date` n'a pas d'heure : l'âge court depuis la fin de la journée
  // du scrutin, donc la comparaison se fait de date à date.
  it('gives the oldest date a degraded threshold accepts', () => {
    expect(freshnessFloorDate(new Date('2026-10-09T16:10:00Z'))).toBe(
      '2026-10-08',
    );
    // Avant midi, l'avant-veille reste dans la fenêtre.
    expect(freshnessFloorDate(new Date('2026-10-09T10:00:00Z'))).toBe(
      '2026-10-07',
    );
    expect(freshnessFloorDate(new Date('2026-10-09T16:10:00Z'), 12)).toBe(
      '2026-10-09',
    );
  });
});
