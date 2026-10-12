import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { generateHemicycleSeats } from '@elupedia/shared/src/hemicycle-layout.js';
import { POLITICAL_GROUP_COLORS } from '@elupedia/shared/src/political-group-colors.js';
import type { BallotFacts } from '../script-facts.js';
import type { Scene } from '../script-schema.js';
import { BigText, CountUp, Logo, useReveal } from './components.js';
import { COLORS, FONT, POSITION_LABELS, shortGroupName } from './theme.js';
import { assignSeatsByAngle } from './timeline.js';

const Center: React.FC<{ children: React.ReactNode; top?: number }> = ({
  children,
  top = 300,
}) => (
  <div
    style={{
      position: 'absolute',
      top,
      left: 70,
      right: 70,
      bottom: 600,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 40,
    }}
  >
    {children}
  </div>
);

export const TitleScene: React.FC<{ scene: Scene; ballot: BallotFacts }> = ({
  scene,
  ballot,
}) => (
  <Center>
    {scene.onScreenText ? (
      <BigText size={scene.onScreenText.length > 40 ? 60 : 84}>
        {scene.onScreenText}
      </BigText>
    ) : (
      <BigText size={56}>{ballot.title}</BigText>
    )}
    {scene.kind === 'hook' && ballot.result ? (
      <ResultBadge result={ballot.result} delay={12} />
    ) : null}
  </Center>
);

const ResultBadge: React.FC<{
  result: 'adopté' | 'rejeté';
  delay?: number;
}> = ({ result, delay = 0 }) => {
  const style = useReveal(delay);
  const color = result === 'adopté' ? COLORS.for : COLORS.against;
  return (
    <div
      style={{
        ...style,
        fontFamily: FONT,
        fontSize: 40,
        fontWeight: 800,
        letterSpacing: 3,
        textTransform: 'uppercase',
        color: COLORS.text,
        background: color,
        padding: '14px 36px',
        borderRadius: 999,
      }}
    >
      {result}
    </div>
  );
};

const SEAT_COLORS = {
  for: COLORS.for,
  against: COLORS.against,
  abstain: COLORS.abstain,
  absent: COLORS.absent,
} as const;

export const HemicycleScene: React.FC<{ ballot: BallotFacts }> = ({
  ballot,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalSeats = Math.max(ballot.counts.seats, 1);
  const seats = React.useMemo(
    () => generateHemicycleSeats(totalSeats),
    [totalSeats],
  );
  const positions = React.useMemo(
    () => assignSeatsByAngle(ballot.counts, seats),
    [ballot.counts, seats],
  );
  // Révélation progressive des sièges sur 1,5 s.
  const revealed = interpolate(frame, [0, fps * 1.5], [0, totalSeats], {
    extrapolateRight: 'clamp',
  });

  return (
    <Center top={260}>
      <svg
        viewBox="-102 -8 204 112"
        width={940}
        height={520}
        style={{ overflow: 'visible' }}
      >
        {seats.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={100 - y}
            r={1.9}
            fill={i < revealed ? SEAT_COLORS[positions[i]] : '#1e293b'}
          />
        ))}
      </svg>
      <div
        style={{
          display: 'flex',
          gap: 48,
          fontFamily: FONT,
          color: COLORS.text,
        }}
      >
        {(['for', 'against', 'abstain'] as const).map((pos, i) => (
          <div key={pos} style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 92,
                fontWeight: 800,
                color: SEAT_COLORS[pos],
                lineHeight: 1,
              }}
            >
              <CountUp value={ballot.counts[pos]} delay={10 + i * 6} />
            </div>
            <div
              style={{
                fontSize: 30,
                color: COLORS.muted,
                marginTop: 10,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              {POSITION_LABELS[pos]}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 34,
          color: COLORS.muted,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 22,
            height: 22,
            borderRadius: 11,
            background: COLORS.absent,
          }}
        />
        <span>
          <span style={{ color: COLORS.text, fontWeight: 800 }}>
            <CountUp value={ballot.counts.notVoting} delay={28} />
          </span>{' '}
          sur {ballot.counts.seats} n'ont pas pris part au vote
        </span>
      </div>
      {ballot.result ? <ResultBadge result={ballot.result} delay={40} /> : null}
    </Center>
  );
};

const MAX_BARS = 8;

export const BarsScene: React.FC<{ ballot: BallotFacts }> = ({ ballot }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const groups = ballot.groups
    .filter((g) => (g.memberCount ?? 0) > 0)
    .slice(0, MAX_BARS);
  const max = Math.max(1, ...groups.map((g) => g.memberCount ?? 0));
  return (
    <Center top={280}>
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          fontFamily: FONT,
        }}
      >
        {groups.map((g, i) => {
          const p = spring({
            frame: frame - i * 4,
            fps,
            config: { damping: 200 },
          });
          const color = POLITICAL_GROUP_COLORS[g.name] ?? COLORS.muted;
          const posColor =
            SEAT_COLORS[
              (Object.entries(POSITION_LABELS).find(
                ([, label]) =>
                  label.toLowerCase() === g.majorityPosition.toLowerCase(),
              )?.[0] ?? 'absent') as keyof typeof SEAT_COLORS
            ] ?? COLORS.muted;
          return (
            <div key={g.name} style={{ opacity: p }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: COLORS.text,
                  fontSize: 34,
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                <span>{shortGroupName(g.name)}</span>
                <span style={{ color: posColor, textTransform: 'uppercase' }}>
                  {g.majorityPosition}
                </span>
              </div>
              <div
                style={{
                  height: 26,
                  background: 'rgba(148,163,184,0.18)',
                  borderRadius: 13,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${((g.memberCount ?? 0) / max) * 100 * p}%`,
                    background: color,
                    borderRadius: 13,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Center>
  );
};

export const GroupFocusScene: React.FC<{
  scene: Scene;
  ballot: BallotFacts;
}> = ({ scene, ballot }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const name = scene.lowerThird?.name ?? ballot.mostDividedGroup?.name ?? null;
  const group = ballot.groups.find((g) => g.name === name) ?? null;
  const p = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  if (!group) {
    return (
      <Center>
        <BigText size={60}>{scene.onScreenText || ballot.title}</BigText>
      </Center>
    );
  }
  const total = Math.max(1, group.for + group.against + group.abstain);
  const parts = (['for', 'against', 'abstain'] as const).map((pos) => ({
    pos,
    n: group[pos],
    pct: (group[pos] / total) * 100,
  }));
  return (
    <Center top={320}>
      <BigText size={64}>{shortGroupName(group.name)}</BigText>
      <div
        style={{
          width: '100%',
          height: 60,
          display: 'flex',
          borderRadius: 30,
          overflow: 'hidden',
          background: 'rgba(148,163,184,0.18)',
        }}
      >
        {parts.map((part) => (
          <div
            key={part.pos}
            style={{
              width: `${part.pct * p}%`,
              background: SEAT_COLORS[part.pos],
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 44,
          fontFamily: FONT,
          color: COLORS.text,
          fontSize: 36,
          fontWeight: 700,
        }}
      >
        {parts
          .filter((part) => part.n > 0)
          .map((part) => (
            <span key={part.pos} style={{ color: SEAT_COLORS[part.pos] }}>
              {part.n} {POSITION_LABELS[part.pos].toLowerCase()}
            </span>
          ))}
      </div>
      {scene.onScreenText ? (
        <BigText size={48} delay={20} color={COLORS.muted}>
          {scene.onScreenText}
        </BigText>
      ) : null}
    </Center>
  );
};

export const SourceScene: React.FC<{ scene: Scene; ballot: BallotFacts }> = ({
  scene,
  ballot,
}) => (
  <Center>
    <div style={useReveal(0)}>
      <Logo size={380} />
    </div>
    <BigText size={88} color={COLORS.accent} delay={6}>
      Elupedia
    </BigText>
    <BigText size={40} delay={8}>
      Le vote de chaque élu, scrutin par scrutin
    </BigText>
    <div
      style={{
        ...useReveal(16),
        fontFamily: FONT,
        fontSize: 32,
        color: COLORS.text,
        background: COLORS.band,
        padding: '18px 30px',
        borderRadius: 14,
        wordBreak: 'break-all',
        textAlign: 'center',
      }}
    >
      {scene.onScreenText || ballot.url}
    </div>
    <div
      style={{
        ...useReveal(24),
        fontFamily: FONT,
        fontSize: 26,
        color: COLORS.muted,
        textAlign: 'center',
      }}
    >
      Données : {ballot.chamber}, licence ouverte
    </div>
  </Center>
);
