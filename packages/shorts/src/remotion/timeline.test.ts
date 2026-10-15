import { describe, it, expect } from 'vitest';
import {
  activeChunk,
  assignSeats,
  assignSeatsByAngle,
  assignSeatsByGroup,
  buildTimeline,
  groupBreakdown,
  orderGroups,
  chunkWords,
  estimateWordTimings,
} from './timeline.js';
import type { ShortScript } from '../script-schema.js';
import type { StoredVoiceover } from '../voiceover.js';

const script: ShortScript = {
  title: 't',
  scenes: [
    {
      id: 's1',
      kind: 'hook',
      durationSec: 5,
      voiceover: 'a',
      onScreenText: '',
      visual: 'title',
      lowerThird: null,
    },
    {
      id: 's2',
      kind: 'result',
      durationSec: 4,
      voiceover: 'b',
      onScreenText: '',
      visual: 'hemicycle',
      lowerThird: null,
    },
    {
      id: 's3',
      kind: 'outro',
      durationSec: 6,
      voiceover: '',
      onScreenText: 'url',
      visual: 'source',
      lowerThird: null,
    },
  ],
  description: 'd',
  hashtags: ['#a', '#b', '#c'],
};

const voiceover: StoredVoiceover = {
  version: 1,
  generatedAt: 'now',
  provider: 'fake',
  voiceId: 'v',
  modelId: 'm',
  outputDir: '/tmp/out',
  scenes: [
    { sceneId: 's1', file: 'x/scene-s1.mp3', durationSec: 3, words: [] },
    { sceneId: 's2', file: 'x/scene-s2.mp3', durationSec: 6.2, words: [] },
  ],
};

describe('buildTimeline', () => {
  it('uses the longer of script duration and audio duration plus a tail', () => {
    const t = buildTimeline(script, voiceover, 30);
    expect(t.scenes.map((s) => s.durationInFrames)).toEqual([150, 201, 180]);
    expect(t.scenes.map((s) => s.from)).toEqual([0, 150, 351]);
    expect(t.totalFrames).toBe(531);
    expect(t.scenes[2].audio).toBeNull();
  });

  it('works without any voice-over', () => {
    const t = buildTimeline(script, null, 30);
    expect(t.totalFrames).toBe(450);
  });
});

describe('chunkWords', () => {
  const w = (word: string, i: number) => ({ word, start: i, end: i + 0.8 });

  it('splits on length and on strong punctuation, without gaps', () => {
    const words = [
      'Le',
      'texte',
      'est',
      'adopté.',
      'Deux',
      'cent',
      'quatre-vingts',
      'voix',
      'pour,',
      'deux',
      'cent',
      'soixante',
      'contre.',
    ].map(w);
    const chunks = chunkWords(words, 24);
    expect(chunks.map((c) => c.words.map((x) => x.word).join(' '))).toEqual([
      'Le texte est adopté.',
      'Deux cent quatre-vingts',
      'voix pour, deux cent',
      'soixante contre.',
    ]);
    expect(chunks[0].start).toBe(0);
    expect(chunks[0].end).toBe(chunks[1].start);
    expect(activeChunk(chunks, 5.5)?.words[0].word).toBe('Deux');
    expect(activeChunk(chunks, 99)).toBeNull();
  });

  it('returns nothing for no words', () => {
    expect(chunkWords([])).toEqual([]);
  });
});

describe('assignSeats', () => {
  it('puts non-voters in grey between for and against', () => {
    const seats = assignSeats({ for: 2, against: 3, abstain: 1, absent: 1 }, 8);
    expect(seats).toEqual([
      'for',
      'for',
      'abstain',
      'absent',
      'absent',
      'against',
      'against',
      'against',
    ]);
  });

  it('never exceeds the seat count', () => {
    expect(
      assignSeats({ for: 10, against: 10, abstain: 0, absent: 0 }, 5),
    ).toHaveLength(5);
  });
});

describe('assignSeatsByAngle', () => {
  it('puts "for" on the left and "against" on the right whatever the seat order', () => {
    // Trois sièges sur un arc : droite (angle 0), haut (π/2), gauche (π),
    // volontairement dans le désordre.
    const seats: [number, number][] = [
      [10, 0],
      [-10, 0],
      [0, 10],
    ];
    const positions = assignSeatsByAngle(
      { for: 1, against: 1, abstain: 1, absent: 0 },
      seats,
    );
    expect(positions).toEqual(['against', 'for', 'abstain']);
    const withGrey = assignSeatsByAngle(
      { for: 1, against: 1, abstain: 0, absent: 0 },
      seats,
    );
    expect(withGrey).toEqual(['against', 'for', 'absent']);
  });
});

describe('estimateWordTimings', () => {
  it('spaces words at a constant rate with a pause after sentences', () => {
    const w = estimateWordTimings('Un deux. Trois', 0, 2);
    expect(w.map((x) => x.word)).toEqual(['Un', 'deux.', 'Trois']);
    expect(w[0]).toEqual({ word: 'Un', start: 0, end: 0.425 });
    expect(w[1].start).toBeCloseTo(0.5);
    expect(w[2].start).toBeCloseTo(1.35);
  });

  it('returns nothing for blank text', () => {
    expect(estimateWordTimings('   ')).toEqual([]);
  });
});

describe('assignSeatsByGroup', () => {
  // Cinq sièges sur un arc, de gauche (π) à droite (0), dans le désordre.
  const seats: [number, number][] = [
    [10, 0],
    [-10, 0],
    [0, 10],
    [-7, 7],
    [7, 7],
  ];

  it('places group blocks left to right and colours seats by vote', () => {
    const positions = assignSeatsByGroup(
      [
        {
          name: 'Rassemblement National (RN)',
          memberCount: 2,
          for: 2,
          against: 0,
          abstain: 0,
        },
        {
          name: 'Socialistes et apparentés (SOC)',
          memberCount: 3,
          for: 0,
          against: 2,
          abstain: 0,
        },
      ],
      seats,
    );
    // Gauche → droite : bloc SOC (gris puis contre, contre) puis bloc RN (pour, pour).
    const leftToRight = [1, 3, 2, 4, 0].map((i) => positions[i]);
    expect(leftToRight).toEqual(['absent', 'against', 'against', 'for', 'for']);
  });

  it('pads with grey when group sizes do not cover every seat', () => {
    const positions = assignSeatsByGroup(
      [
        {
          name: 'Les Démocrates (Dem)',
          memberCount: 1,
          for: 1,
          against: 0,
          abstain: 0,
        },
      ],
      seats,
    );
    expect(positions.filter((p) => p === 'absent')).toHaveLength(4);
  });
});

describe('groupBreakdown / orderGroups', () => {
  it('derives the non-voting members and caps at the group size', () => {
    expect(
      groupBreakdown({
        name: 'g',
        memberCount: 47,
        for: 9,
        against: 1,
        abstain: 5,
      }),
    ).toEqual({ members: 47, for: 9, abstain: 5, grey: 32, against: 1 });
    expect(
      groupBreakdown({
        name: 'g',
        memberCount: 3,
        for: 5,
        against: 5,
        abstain: 0,
      }),
    ).toEqual({ members: 3, for: 3, abstain: 0, grey: 0, against: 0 });
  });

  it('orders groups left to right and drops unknown sizes', () => {
    const names = orderGroups([
      {
        name: 'Rassemblement National (RN)',
        memberCount: 1,
        for: 0,
        against: 0,
        abstain: 0,
      },
      {
        name: 'Sans effectif',
        memberCount: null,
        for: 0,
        against: 0,
        abstain: 0,
      },
      {
        name: 'Socialistes et apparentés (SOC)',
        memberCount: 1,
        for: 0,
        against: 0,
        abstain: 0,
      },
    ]).map((g) => g.name);
    expect(names).toEqual([
      'Socialistes et apparentés (SOC)',
      'Rassemblement National (RN)',
    ]);
  });
});
