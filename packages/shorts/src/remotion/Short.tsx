import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { POLITICAL_GROUP_COLORS } from '@elupedia/shared/src/political-group-colors.js';
import type { ShortProps } from './props.js';
import { buildTimeline, type TimelineScene } from './timeline.js';
import {
  Background,
  Footer,
  Header,
  LowerThird,
  Subtitles,
} from './components.js';
import {
  BarsScene,
  GroupFocusScene,
  HemicycleScene,
  SourceScene,
  TitleScene,
} from './scenes.js';
import { FPS } from './props.js';
import { COLORS } from './theme.js';

const SceneView: React.FC<{
  entry: TimelineScene;
  props: ShortProps;
  broll: string | undefined;
}> = ({ entry, props, broll }) => {
  const { scene } = entry;
  // Un short peut couvrir plusieurs scrutins : à défaut d'indication dans le
  // script, les scènes se répartissent sur le premier.
  const ballot = props.facts.ballots[0];
  let body: React.ReactNode;
  switch (scene.visual) {
    case 'hemicycle':
      body = <HemicycleScene ballot={ballot} />;
      break;
    case 'bars':
      body = <BarsScene ballot={ballot} />;
      break;
    case 'group_focus':
      body = <GroupFocusScene scene={scene} ballot={ballot} />;
      break;
    case 'source':
      body = <SourceScene scene={scene} ballot={ballot} />;
      break;
    default:
      body = <TitleScene scene={scene} ballot={ballot} photos={props.photos} />;
  }
  return (
    <AbsoluteFill>
      <Background broll={scene.visual === 'title' ? broll : undefined} />
      <Header chamber={ballot.chamber} dateLabel={ballot.dateLabel} />
      {body}
      {scene.lowerThird ? (
        <LowerThird
          name={scene.lowerThird.name}
          role={scene.lowerThird.role}
          accent={(() => {
            const group = ballot.proposers.find(
              (p) => p.name === scene.lowerThird?.name,
            )?.group;
            return group ? POLITICAL_GROUP_COLORS[group] : undefined;
          })()}
        />
      ) : null}
      {entry.audio?.file ? (
        <Audio src={staticFile(entry.audio.file.split('/').pop()!)} />
      ) : null}
      {entry.audio ? <Subtitles words={entry.audio.words} /> : null}
      <Footer />
    </AbsoluteFill>
  );
};

export const Short: React.FC<ShortProps> = (props) => {
  const timeline = buildTimeline(props.script, props.voiceover, FPS);
  return (
    <AbsoluteFill style={{ background: COLORS.bgTop }}>
      {timeline.scenes.map((entry, i) => (
        <Sequence
          key={entry.scene.id}
          from={entry.from}
          durationInFrames={entry.durationInFrames}
          name={`${entry.scene.id} ${entry.scene.kind}`}
        >
          <SceneView
            entry={entry}
            props={props}
            broll={props.broll[i % Math.max(1, props.broll.length)]}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
