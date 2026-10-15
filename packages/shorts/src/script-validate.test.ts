import { describe, it, expect } from 'vitest';
import { buildBallotFacts, type ShortFacts } from './script-facts.js';
import type { ShortScript } from './script-schema.js';
import { allowedNumbers, validateScript } from './script-validate.js';

const facts: ShortFacts = {
  shortId: 'short-1',
  ballots: [
    buildBallotFacts({
      id: 'b1',
      anId: 'scrutin-VTANR5L17V1',
      title: "l'ensemble du projet de loi de finances pour 2027",
      date: '2026-10-08',
      type: 'scrutin public solennel',
      result: 'adopted',
      counts: { for: 280, against: 260, abstain: 10, absent: 27 },
      groups: [
        {
          groupName: 'Ensemble pour la République (EPR)',
          memberCount: 95,
          position: 'for',
          votesFor: 90,
          votesAgainst: 0,
          votesAbstain: 2,
          votesAbsent: 3,
        },
        {
          groupName: 'Les Démocrates (Dem)',
          memberCount: 36,
          position: 'for',
          votesFor: 20,
          votesAgainst: 14,
          votesAbstain: 0,
          votesAbsent: 2,
        },
      ],
    }),
  ],
};

function script(over: Partial<ShortScript> = {}): ShortScript {
  return {
    title: 'Budget 2027 : le scrutin du 8 octobre',
    scenes: [
      {
        id: 's1',
        kind: 'hook',
        durationSec: 7,
        voiceover:
          "Le 8 octobre 2026, l'Assemblée nationale a voté le projet de loi de finances pour 2027.",
        onScreenText: '8 octobre 2026',
        visual: 'title',
        lowerThird: null,
      },
      {
        id: 's2',
        kind: 'result',
        durationSec: 10,
        voiceover:
          'Le texte est adopté : 280 voix pour, 260 contre, 10 abstentions.',
        onScreenText: '280 / 260',
        visual: 'hemicycle',
        lowerThird: null,
      },
      {
        id: 's3',
        kind: 'groups',
        durationSec: 12,
        voiceover:
          'Ensemble pour la République a voté pour. Les Démocrates aussi, mais 14 de ses membres ont voté contre.',
        onScreenText: '',
        visual: 'bars',
        lowerThird: null,
      },
      {
        id: 's4',
        kind: 'outro',
        durationSec: 8,
        voiceover: 'Le vote de chaque député est consultable sur Elupedia.',
        onScreenText: 'https://www.elupedia.fr/scrutins/b1',
        visual: 'source',
        lowerThird: null,
      },
    ],
    description:
      'Scrutin sur le projet de loi de finances pour 2027. Source : Elupedia — https://www.elupedia.fr/scrutins/b1. Données : Assemblée nationale, licence ouverte.',
    hashtags: ['#Elupedia', '#Assemblée', '#Budget'],
    ...over,
  };
}

describe('buildBallotFacts', () => {
  const b = facts.ballots[0];

  it('derives chamber, result, percentages and sorted groups', () => {
    expect(b.chamber).toBe('Assemblée nationale');
    expect(b.result).toBe('adopté');
    expect(b.dateLabel).toBe('8 octobre 2026');
    expect(b.counts.expressed).toBe(550);
    // Effectif : somme des groupes (131) < 577 votes enregistrés, on prend le max.
    expect(b.counts.seats).toBe(577);
    expect(b.counts.notVoting).toBe(27);
    expect(b.participationPercent).toBe(95);
    expect(b.percentOfExpressed).toEqual({ for: 51, against: 47, abstain: 2 });
    expect(b.groups.map((g) => g.name)).toEqual([
      'Ensemble pour la République (EPR)',
      'Les Démocrates (Dem)',
    ]);
    expect(b.groups[1].majorityPosition).toBe('pour');
    expect(b.url).toBe('https://www.elupedia.fr/scrutins/b1');
  });

  it('flags the most divided group', () => {
    expect(b.mostDividedGroup).toEqual({
      name: 'Les Démocrates (Dem)',
      majorityPosition: 'pour',
      minorityShare: 0.41,
    });
  });
});

describe('allowedNumbers', () => {
  it('collects counts, percentages, group figures, title and date numbers', () => {
    const allowed = allowedNumbers(facts);
    for (const n of [
      2027, 8, 2026, 280, 260, 10, 27, 550, 51, 47, 2, 95, 90, 36, 20, 14, 41,
    ]) {
      expect(allowed.has(n), String(n)).toBe(true);
    }
    expect(allowed.has(300)).toBe(false);
  });
});

describe('validateScript', () => {
  it('accepts a compliant script', () => {
    expect(validateScript(script(), facts)).toEqual([]);
  });

  it('rejects numbers absent from the facts', () => {
    const s = script();
    s.scenes[1].voiceover = 'Le texte est adopté : 300 voix pour.';
    const issues = validateScript(s, facts);
    expect(issues.map((i) => i.code)).toContain('unknown_number');
    expect(issues[0].message).toContain('300');
  });

  it('accepts thousands separators and date numbers', () => {
    const s = script();
    s.scenes[0].onScreenText = '8 octobre 2026';
    expect(validateScript(s, facts)).toEqual([]);
  });

  it('rejects evaluative vocabulary, accents and case ignored', () => {
    const s = script();
    s.scenes[0].voiceover = 'Un vote HISTORIQUE, enfin, à l’Assemblée.';
    const codes = validateScript(s, facts).map((i) => i.code);
    expect(codes.filter((c) => c === 'banned_word')).toHaveLength(2);
  });

  it('enforces total duration and reading speed', () => {
    const tooShort = script();
    tooShort.scenes = tooShort.scenes.map((sc) => ({ ...sc, durationSec: 3 }));
    expect(validateScript(tooShort, facts).map((i) => i.code)).toContain(
      'too_short',
    );

    const tooLong = script();
    tooLong.scenes = [
      ...tooLong.scenes.map((sc) => ({ ...sc, durationSec: 15 })),
      { ...tooLong.scenes[1], id: 's5', durationSec: 5 },
    ];
    expect(validateScript(tooLong, facts).map((i) => i.code)).toContain(
      'too_long',
    );

    const tooFast = script();
    tooFast.scenes[0].durationSec = 3;
    tooFast.scenes[3].durationSec = 11;
    expect(validateScript(tooFast, facts).map((i) => i.code)).toContain(
      'too_fast',
    );
  });

  it('requires a source scene and an Elupedia mention in the description', () => {
    const s = script({ description: 'Sans source.' });
    expect(validateScript(s, facts).map((i) => i.code)).toContain(
      'missing_source',
    );
  });

  it('rejects duplicate scene ids and overlong titles', () => {
    const s = script({ title: 'x'.repeat(80) });
    s.scenes[1].id = 's1';
    const codes = validateScript(s, facts).map((i) => i.code);
    expect(codes).toContain('duplicate_scene_id');
    expect(codes).toContain('title_too_long');
  });

  it('rejects a lower third naming someone absent from the data', () => {
    const s = script();
    s.scenes[0].lowerThird = { name: 'Personne Inventée', role: 'Auteur' };
    expect(validateScript(s, facts).map((i) => i.code)).toContain(
      'unknown_person',
    );
    s.scenes[0].lowerThird = {
      name: 'Les Démocrates (Dem)',
      role: "Groupe à l'Assemblée nationale",
    };
    expect(validateScript(s, facts)).toEqual([]);
  });

  it('requires the official result to be spoken', () => {
    const s = script();
    s.scenes[1].voiceover = '280 voix pour, 260 contre, 10 abstentions.';
    expect(validateScript(s, facts).map((i) => i.code)).toContain(
      'missing_result',
    );
    s.scenes[1].voiceover = 'Le texte est adopté : 280 voix pour.';
    expect(validateScript(s, facts).map((i) => i.code)).not.toContain(
      'missing_result',
    );
  });

  it('rejects group acronyms spoken aloud and suggests the full name', () => {
    const s = script();
    s.scenes[2].voiceover = 'EPR a voté pour, Dem aussi.';
    const issues = validateScript(s, facts).filter(
      (i) => i.code === 'spoken_acronym',
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].message).toContain('Ensemble pour la République');
    // LFI-NFP et LIOT se prononcent : leur sigle est admis à voix haute.
    s.scenes[2].voiceover = 'LFI-NFP et LIOT ont voté contre.';
    const withPronounceable = {
      ...facts,
      ballots: [
        {
          ...facts.ballots[0],
          groups: [
            ...facts.ballots[0].groups,
            ...[
              [
                'La France insoumise - Nouveau Front Populaire (LFI-NFP)',
                'LFI-NFP',
              ],
              [
                'Libertés, Indépendants, Outre-mer et Territoires (LIOT)',
                'LIOT',
              ],
            ].map(([name, spokenName]) => ({
              name,
              spokenName,
              memberCount: 20,
              majorityPosition: 'contre',
              for: 0,
              against: 15,
              abstain: 0,
              absent: 0,
            })),
          ],
        },
      ],
    };
    expect(
      validateScript(s, withPronounceable).filter(
        (i) => i.code === 'spoken_acronym',
      ),
    ).toEqual([]);
    // ... alors que SOC ou EPR restent refusés à voix haute.
    s.scenes[2].voiceover = 'EPR et LFI-NFP ont voté contre.';
    expect(
      validateScript(s, withPronounceable).filter(
        (i) => i.code === 'spoken_acronym',
      ),
    ).toHaveLength(1);
    // Un mot qui contient le sigle n'est pas le sigle.
    s.scenes[2].voiceover =
      'Les Démocrates ont voté pour, dans un cadre démocratique.';
    expect(
      validateScript(s, facts).filter((i) => i.code === 'spoken_acronym'),
    ).toEqual([]);
  });
});
