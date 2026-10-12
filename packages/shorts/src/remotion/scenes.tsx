import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { generateHemicycleSeats } from '@elupedia/shared/src/hemicycle-layout.js';
import { POLITICAL_GROUP_COLORS } from '@elupedia/shared/src/political-group-colors.js';
import type { BallotFacts } from '../script-facts.js';
import type { Scene } from '../script-schema.js';
import { BigText, CountUp, Logo, useReveal } from './components.js';
import { COLORS, FONT, shortGroupName } from './theme.js';
import {
  Seat,
  VOTE_LABELS,
  VoteIcon,
  segmentBackground,
} from './vote-icons.js';
import {
  assignSeatsByAngle,
  assignSeatsByGroup,
  groupBreakdown,
  orderGroups,
} from './timeline.js';

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
  // En salle par groupe quand les effectifs sont connus (AN), sinon par
  // position (Sénat : pas de décompte par groupe dans la source).
  const positions = React.useMemo(
    () =>
      ballot.groups.length > 0
        ? assignSeatsByGroup(ballot.groups, seats)
        : assignSeatsByAngle(ballot.counts, seats),
    [ballot.groups, ballot.counts, seats],
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
          <Seat
            key={i}
            x={x}
            y={100 - y}
            position={positions[i]}
            revealed={i < revealed}
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <VoteIcon position={pos} size={30} />
              {VOTE_LABELS[pos]}
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
        <VoteIcon position="absent" size={30} />
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

const MAX_BARS = 12;
/** Instant (s) où les barres de position se transforment en détail des voix. */
const MORPH_AT_SEC = 3;
const MORPH_DURATION_SEC = 0.9;

/**
 * Scène des groupes, en deux temps : d'abord une barre par groupe (longueur
 * proportionnelle à l'effectif, couleur du groupe, position majoritaire),
 * puis chaque barre se transforme en barre empilée pour / abstention / sans
 * vote / contre, avec le même code couleur pour tous les groupes — chaque
 * groupe est ainsi détaillé de la même façon, sans en isoler un.
 */
export const BarsScene: React.FC<{ ballot: BallotFacts }> = ({ ballot }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Ordre alphabétique du sigle : aucun groupe n'est mis en avant par sa
  // place (l'ordre gauche/droite reste réservé à l'hémicycle).
  const groups = [...orderGroups(ballot.groups)]
    .sort((a, b) =>
      shortGroupName(a.name).localeCompare(shortGroupName(b.name), 'fr', {
        sensitivity: 'base',
      }),
    )
    .slice(0, MAX_BARS);
  const max = Math.max(1, ...groups.map((g) => g.memberCount ?? 0));
  const morph = interpolate(
    frame,
    [MORPH_AT_SEC * fps, (MORPH_AT_SEC + MORPH_DURATION_SEC) * fps],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const rowHeight = groups.length > 9 ? 18 : 24;
  const fontSize = groups.length > 9 ? 28 : 32;

  return (
    <Center top={260}>
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: groups.length > 9 ? 14 : 20,
          fontFamily: FONT,
        }}
      >
        {groups.map((g, i) => {
          const enter = spring({
            frame: frame - i * 3,
            fps,
            config: { damping: 200 },
          });
          const color = POLITICAL_GROUP_COLORS[g.name] ?? COLORS.muted;
          const b = groupBreakdown(g);
          const width = (b.members / max) * 100 * enter;
          const segments = [
            { key: 'for' as const, n: b.for },
            { key: 'abstain' as const, n: b.abstain },
            { key: 'absent' as const, n: b.grey },
            { key: 'against' as const, n: b.against },
          ];
          const posColor =
            g.majorityPosition === 'pour'
              ? SEAT_COLORS.for
              : g.majorityPosition === 'contre'
                ? SEAT_COLORS.against
                : SEAT_COLORS.abstain;
          return (
            <div key={g.name} style={{ opacity: enter }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  color: COLORS.text,
                  fontSize,
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                <span>{shortGroupName(g.name)}</span>
                <span style={{ position: 'relative', height: fontSize * 1.2 }}>
                  <span
                    style={{
                      position: 'absolute',
                      right: 0,
                      opacity: 1 - morph,
                      color: posColor,
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {g.majorityPosition}
                  </span>
                  <span
                    style={{
                      position: 'absolute',
                      right: 0,
                      opacity: morph,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {segments
                      .filter((seg) => seg.n > 0)
                      .map((seg, k) => (
                        <span
                          key={seg.key}
                          style={{
                            color: SEAT_COLORS[seg.key],
                            marginLeft: k > 0 ? 14 : 0,
                          }}
                        >
                          <VoteIcon
                            position={seg.key}
                            size={fontSize * 0.9}
                            style={{ marginRight: 4 }}
                          />
                          {seg.n}
                        </span>
                      ))}
                  </span>
                </span>
              </div>
              <div
                style={{
                  height: rowHeight,
                  background: 'rgba(148,163,184,0.18)',
                  borderRadius: rowHeight / 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${width}%`,
                    display: 'flex',
                    borderRadius: rowHeight / 2,
                    overflow: 'hidden',
                  }}
                >
                  {segments.map((seg) => (
                    <div
                      key={seg.key}
                      style={{
                        height: '100%',
                        width: `${(seg.n / Math.max(1, b.members)) * 100}%`,
                        // Avant le morphing, tous les segments portent la
                        // couleur du groupe ; ils prennent ensuite celle du vote.
                        background: color,
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: segmentBackground(seg.key),
                          opacity: morph,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 26,
          color: COLORS.muted,
          opacity: morph,
          display: 'flex',
          gap: 28,
        }}
      >
        {(['for', 'abstain', 'absent', 'against'] as const).map((key) => (
          <span
            key={key}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <VoteIcon position={key} size={26} />
            {VOTE_LABELS[key]}
          </span>
        ))}
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
              <VoteIcon
                position={part.pos}
                size={34}
                style={{ marginRight: 8 }}
              />
              {part.n} {VOTE_LABELS[part.pos].toLowerCase()}
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
