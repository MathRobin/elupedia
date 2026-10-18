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
  ChartScene,
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
  // script, les scènes se répartissent sur le premier. Un short « thème » n'en
  // a aucun : les visuels de scrutin retombent sur la scène titre.
  const ballot = props.facts.ballots[0];
  const topic = props.facts.topic;
  const chart = topic?.charts.find((c) => c.id === scene.chart);
  let body: React.ReactNode;
  switch (scene.visual) {
    case 'hemicycle':
      body = ballot ? <HemicycleScene ballot={ballot} /> : null;
      break;
    case 'bars':
      body = ballot ? <BarsScene ballot={ballot} /> : null;
      break;
    case 'group_focus':
      body = ballot ? <GroupFocusScene scene={scene} ballot={ballot} /> : null;
      break;
    case 'chart':
      body = chart ? <ChartScene chart={chart} /> : null;
      break;
    case 'source':
      body = <SourceScene scene={scene} facts={props.facts} />;
      break;
  }
  if (!body) {
    body = (
      <TitleScene scene={scene} facts={props.facts} photos={props.photos} />
    );
  }
  return (
    <AbsoluteFill>
      <Background broll={scene.visual === 'title' ? broll : undefined} />
      <Header
        chamber={ballot?.chamber ?? topic?.chamber ?? ''}
        dateLabel={ballot?.dateLabel ?? topic?.dateLabel ?? ''}
      />
      {body}
      {scene.lowerThird ? (
        <LowerThird
          name={scene.lowerThird.name}
          role={scene.lowerThird.role}
          accent={(() => {
            const group = ballot?.proposers.find(
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
