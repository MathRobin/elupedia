import React from 'react';
import { COLORS } from './theme.js';
import type { SeatPosition } from './timeline.js';

/**
 * Codage des positions de vote par forme et motif, en plus de la couleur,
 * pour rester lisible par les daltoniens : coche = pour, croix = contre,
 * barre = abstention, cercle pointillé = sans vote. Les mêmes formes servent
 * de légende, de puces devant les chiffres, de motif dans les barres et de
 * forme de siège dans l'hémicycle.
 */

export const VOTE_COLORS: Record<SeatPosition, string> = {
  for: COLORS.for,
  against: COLORS.against,
  abstain: COLORS.abstain,
  absent: COLORS.absent,
};

export const VOTE_LABELS: Record<SeatPosition, string> = {
  for: 'Pour',
  against: 'Contre',
  abstain: 'Abstention',
  absent: 'Sans vote',
};

export const VoteIcon: React.FC<{
  position: SeatPosition;
  size?: number;
  style?: React.CSSProperties;
}> = ({ position, size = 28, style }) => {
  const color = VOTE_COLORS[position];
  const stroke = {
    stroke: '#f8fafc',
    strokeWidth: 3.2,
    strokeLinecap: 'round' as const,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
    >
      {position === 'absent' ? (
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={color}
          strokeWidth="2.6"
          strokeDasharray="3.5 3"
        />
      ) : (
        <circle cx="12" cy="12" r="11" fill={color} />
      )}
      {position === 'for' ? (
        <path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" {...stroke} />
      ) : null}
      {position === 'against' ? (
        <path d="M8 8l8 8M16 8l-8 8" fill="none" {...stroke} />
      ) : null}
      {position === 'abstain' ? (
        <path d="M7 12h10" fill="none" {...stroke} />
      ) : null}
    </svg>
  );
};

/** Motif de remplissage d'un segment de barre : uni, hachuré, pointillé, grisé. */
export function segmentBackground(position: SeatPosition): string {
  const c = VOTE_COLORS[position];
  switch (position) {
    case 'against':
      return `repeating-linear-gradient(135deg, ${c} 0 7px, rgba(15,23,42,0.55) 7px 11px)`;
    case 'abstain':
      return `radial-gradient(circle, rgba(15,23,42,0.6) 2.2px, ${c} 2.6px)`;
    case 'absent':
      return `repeating-linear-gradient(45deg, ${c} 0 4px, rgba(15,23,42,0.35) 4px 8px)`;
    default:
      return c;
  }
}

/** Siège d'hémicycle : forme selon la position, à la même échelle. */
export const Seat: React.FC<{
  x: number;
  y: number;
  position: SeatPosition;
  revealed: boolean;
}> = ({ x, y, position, revealed }) => {
  if (!revealed) return <circle cx={x} cy={y} r={1.9} fill="#1e293b" />;
  const color = VOTE_COLORS[position];
  switch (position) {
    case 'against':
      return (
        <circle
          cx={x}
          cy={y}
          r={1.5}
          fill="none"
          stroke={color}
          strokeWidth={0.9}
        />
      );
    case 'abstain':
      return (
        <rect x={x - 1.7} y={y - 1.7} width={3.4} height={3.4} fill={color} />
      );
    case 'absent':
      return <circle cx={x} cy={y} r={1.2} fill={color} opacity={0.8} />;
    default:
      return <circle cx={x} cy={y} r={1.9} fill={color} />;
  }
};
