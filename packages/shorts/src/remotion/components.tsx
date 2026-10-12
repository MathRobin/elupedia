import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { POLITICAL_GROUP_COLORS } from '@elupedia/shared/src/political-group-colors.js';
import { COLORS, FONT } from './theme.js';
import { activeChunk, chunkWords } from './timeline.js';
import type { WordTiming } from '../tts.js';

export const Background: React.FC<{ broll?: string }> = ({ broll }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.08], {
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${COLORS.bgTop} 0%, ${COLORS.bgBottom} 100%)`,
      }}
    >
      {broll ? (
        <>
          <Img
            src={staticFile(broll)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${zoom})`,
              opacity: 0.55,
            }}
          />
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(180deg, rgba(15,23,42,0.2) 0%, rgba(15,23,42,0.85) 100%)',
            }}
          />
        </>
      ) : (
        <AbsoluteFill
          style={{
            background:
              'radial-gradient(circle at 30% 20%, rgba(96,165,250,0.18), transparent 55%)',
            transform: `scale(${zoom})`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

/** Entrée en fondu + légère montée, déclenchée à `delay` frames. */
export function useReveal(delay = 0): React.CSSProperties {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return { opacity: p, transform: `translateY(${(1 - p) * 24}px)` };
}

export const Header: React.FC<{ chamber: string; dateLabel: string }> = ({
  chamber,
  dateLabel,
}) => (
  <div
    style={{
      position: 'absolute',
      top: 150,
      left: 70,
      right: 70,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontFamily: FONT,
      color: COLORS.muted,
      fontSize: 30,
      letterSpacing: 2,
      textTransform: 'uppercase',
    }}
  >
    <span>{chamber}</span>
    <span>{dateLabel}</span>
  </div>
);

/**
 * Sous-titres synchronisés au mot, sur un bandeau légèrement opaque pour
 * rester lisibles sur n'importe quel fond. Le mot en cours est accentué.
 */
export const Subtitles: React.FC<{ words: WordTiming[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const chunks = React.useMemo(() => chunkWords(words), [words]);
  const chunk = activeChunk(chunks, t);
  if (!chunk) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        right: 60,
        bottom: 420,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: COLORS.band,
          borderRadius: 18,
          padding: '22px 36px',
          fontFamily: FONT,
          fontSize: 54,
          fontWeight: 700,
          lineHeight: 1.25,
          color: COLORS.text,
          textAlign: 'center',
          textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}
      >
        {chunk.words.map((w, i) => (
          <span
            key={i}
            style={{
              color: t >= w.start ? COLORS.accent : COLORS.text,
              marginRight: i < chunk.words.length - 1 ? 14 : 0,
            }}
          >
            {w.word}
          </span>
        ))}
      </div>
    </div>
  );
};

/** Bandeau nom façon JT, affiché quelques secondes en début de scène. */
export const LowerThird: React.FC<{
  name: string;
  role: string;
  /** Couleur du liseré (groupe), sinon déduite du nom ou accent. */
  accent?: string;
}> = ({ name, role, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame, fps, config: { damping: 200 } });
  const outStart = fps * 4;
  const outP = interpolate(frame, [outStart, outStart + fps * 0.4], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const color = accent ?? POLITICAL_GROUP_COLORS[name] ?? COLORS.accent;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        bottom: 640,
        transform: `translateX(${(inP - 1) * 100}%)`,
        opacity: outP,
        display: 'flex',
        alignItems: 'stretch',
        fontFamily: FONT,
      }}
    >
      <div style={{ width: 14, background: color }} />
      <div
        style={{
          background: 'rgba(248,250,252,0.96)',
          padding: '18px 40px 18px 28px',
          borderRadius: '0 14px 14px 0',
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 800, color: COLORS.bgTop }}>
          {name}
        </div>
        <div style={{ fontSize: 26, color: '#334155', marginTop: 4 }}>
          {role}
        </div>
      </div>
    </div>
  );
};

export const BigText: React.FC<{
  children: React.ReactNode;
  size?: number;
  delay?: number;
  color?: string;
}> = ({ children, size = 72, delay = 0, color = COLORS.text }) => {
  const style = useReveal(delay);
  return (
    <div
      style={{
        ...style,
        fontFamily: FONT,
        fontSize: size,
        fontWeight: 800,
        lineHeight: 1.15,
        color,
        textAlign: 'center',
        textShadow: '0 2px 12px rgba(0,0,0,0.5)',
      }}
    >
      {children}
    </div>
  );
};

export const CountUp: React.FC<{ value: number; delay?: number }> = ({
  value,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 30 } });
  return <>{Math.round(value * Math.min(1, p))}</>;
};

/** Logo Elupedia (public/logo.png, copié dans le dossier du short au rendu). */
export const Logo: React.FC<{ size: number; style?: React.CSSProperties }> = ({
  size,
  style,
}) => (
  <Img
    src={staticFile('logo.png')}
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
      ...style,
    }}
  />
);

/** Pied de vidéo : logo + domaine, présent sur toutes les scènes. */
export const Footer: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      bottom: 140,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 18,
      fontFamily: FONT,
      fontSize: 26,
      color: COLORS.muted,
      letterSpacing: 3,
    }}
  >
    <Logo size={56} />
    <span>ELUPEDIA.FR</span>
  </div>
);
