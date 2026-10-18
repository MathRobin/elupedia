import React from 'react';
import { Composition } from 'remotion';
import { Short } from './Short.js';
import { FPS, HEIGHT, WIDTH, type ShortProps } from './props.js';
import { buildTimeline } from './timeline.js';

const defaultProps: ShortProps = {
  facts: {
    shortId: 'preview',
    ballots: [
      {
        ballotId: 'preview',
        chamber: 'Assemblée nationale',
        date: '2026-10-08',
        dateLabel: '8 octobre 2026',
        weekday: 'jeudi',
        proposers: [],
        requestedBy: null,
        title: "l'ensemble du projet de loi (aperçu)",
        type: 'scrutin public solennel',
        result: 'adopté',
        counts: {
          for: 280,
          against: 260,
          abstain: 10,
          absent: 27,
          expressed: 550,
          seats: 577,
          notVoting: 27,
        },
        percentOfExpressed: { for: 51, against: 47, abstain: 2 },
        participationPercent: 95,
        groups: [],
        blocs: { left: null, right: null },
        sources: [],
        mostDividedGroup: null,
        url: 'https://www.elupedia.fr/scrutins/preview',
      },
    ],
  },
  script: {
    title: 'Aperçu',
    scenes: [
      {
        id: 's1',
        kind: 'hook',
        durationSec: 5,
        voiceover: '',
        onScreenText: 'Aperçu',
        visual: 'title',
        chart: null,
        lowerThird: null,
      },
    ],
    description: '',
    hashtags: [],
  },
  voiceover: null,
  broll: [],
  photos: {},
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Short"
    component={Short}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={FPS * 5}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(
        1,
        buildTimeline(props.script, props.voiceover, FPS).totalFrames,
      ),
    })}
  />
);
