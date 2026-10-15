/**
 * Hémicycle en SVG : un point par votant, coloré selon sa position
 * (pour / contre / abstention / absent), avec info-bulle au survol et légende.
 *
 * Rendu sur `pages/scrutins/[id].astro` avec `client:load` (info-bulle
 * interactive). Deux modes de placement :
 * - plan de salle réel (`lib/hemicycle-seats.json`, Assemblée nationale) dès
 *   qu'au moins un votant a un `seatNumber` connu ; les votants sans siège
 *   connu sont alors posés sur les sièges restés libres, et les sièges vides
 *   dessinés en creux ;
 * - disposition générique (`generateHemicycleSeats`) sinon (Sénat, Parlement
 *   européen), où l'ordre des points suit l'ordre de `seats`.
 *
 * Le viewBox est calculé une fois, à l'import, à partir des coordonnées du
 * plan de salle ; la disposition générique partage le même repère.
 */
import { useState, useMemo, useCallback } from 'react';
import seatPositions from '../lib/hemicycle-seats.json';
import { generateHemicycleSeats } from '@elupedia/shared';

type VotePosition = 'for' | 'against' | 'abstain' | 'absent';

interface Seat {
  officialId: string;
  firstName: string;
  lastName: string;
  position: VotePosition;
  politicalGroup: string | null;
  slug: string | null;
  /** Numéro de siège officiel (AN), null si inconnu. */
  seatNumber: number | null;
}

/** Props injectées par la page Astro. */
interface Props {
  seats: Seat[];
}

const POSITION_COLORS: Record<VotePosition, string> = {
  for: '#10b981',
  against: '#ef4444',
  abstain: '#f59e0b',
  absent: '#cbd5e1',
};

const POSITION_LABELS: Record<VotePosition, string> = {
  for: 'Pour',
  against: 'Contre',
  abstain: 'Abstention',
  absent: 'Absent',
};

/** Coordonnées [x, y] par numéro de siège (clé = numéro en chaîne). */
const seatMap = seatPositions as Record<string, [number, number]>;

const allCoords = Object.values(seatMap);
const VIEW_MIN_X = Math.min(...allCoords.map((c) => c[0]));
const VIEW_MAX_X = Math.max(...allCoords.map((c) => c[0]));
const VIEW_MIN_Y = Math.min(...allCoords.map((c) => c[1]));
const VIEW_MAX_Y = Math.max(...allCoords.map((c) => c[1]));
const VIEW_CX = (VIEW_MIN_X + VIEW_MAX_X) / 2;

/** Marge autour des sièges, en unités du repère des sièges. */
const MARGIN = 6;
const VB_X = VIEW_MIN_X - MARGIN;
const VB_Y = VIEW_MIN_Y - MARGIN;
const VB_W = VIEW_MAX_X - VIEW_MIN_X + MARGIN * 2;
const VB_H = VIEW_MAX_Y - VIEW_MIN_Y + MARGIN * 2;

/** Rayon d'un point-siège, en unités du repère. */
const SEAT_RADIUS = 1.5;
/** Podium du président : cercle sous le dernier rang, marqué « P ». */
const PODIUM_RADIUS = 2.5;
const PODIUM_OFFSET_Y = 2;
const PODIUM_LABEL_OFFSET_Y = 3;

type PositionedSeat = { seat: Seat; x: number; y: number };

export default function HemicycleChart({ seats }: Props) {
  // Info-bulle : siège survolé et position en pixels dans le conteneur.
  const [tooltip, setTooltip] = useState<{
    seat: Seat;
    x: number;
    y: number;
  } | null>(null);

  const hasSeatData = seats.some(
    (s) => s.seatNumber != null && seatMap[String(s.seatNumber)],
  );

  const positioned = useMemo<PositionedSeat[]>(() => {
    if (hasSeatData) {
      const placed: PositionedSeat[] = [];
      const unplaced: Seat[] = [];

      for (const seat of seats) {
        const coords =
          seat.seatNumber != null
            ? seatMap[String(seat.seatNumber)]
            : undefined;
        if (coords) {
          placed.push({ seat, x: coords[0], y: coords[1] });
        } else {
          unplaced.push(seat);
        }
      }

      // Les votants sans siège connu occupent les sièges restés libres ;
      // s'il n'y en a pas assez, les derniers ne sont pas dessinés.
      if (unplaced.length > 0) {
        const usedPositions = new Set(placed.map((p) => `${p.x},${p.y}`));
        const freeCoords = Object.values(seatMap).filter(
          (c) => !usedPositions.has(`${c[0]},${c[1]}`),
        );
        for (let i = 0; i < unplaced.length && i < freeCoords.length; i++) {
          placed.push({
            seat: unplaced[i],
            x: freeCoords[i][0],
            y: freeCoords[i][1],
          });
        }
      }

      return placed;
    }

    const genericCoords = generateHemicycleSeats(seats.length);
    return seats.map((seat, i) => ({
      seat,
      x: genericCoords[i][0],
      y: genericCoords[i][1],
    }));
  }, [seats, hasSeatData]);

  // Convertit la position du siège (repère SVG) en pixels du conteneur,
  // le SVG étant redimensionné par CSS.
  const handleMouseEnter = useCallback(
    (seat: Seat, seatX: number, seatY: number, e: React.MouseEvent) => {
      const svg = (e.target as SVGElement).closest('svg')!;
      const rect = svg.getBoundingClientRect();
      const tooltipX = ((seatX - VB_X) / VB_W) * rect.width;
      const tooltipY = ((seatY - VB_Y) / VB_H) * rect.height;
      setTooltip({ seat, x: tooltipX, y: tooltipY });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (positioned.length === 0) return null;

  const emptySeats = hasSeatData
    ? Object.entries(seatMap)
        .filter(
          ([id]) => !positioned.some((p) => p.seat.seatNumber === Number(id)),
        )
        .map(([, coords]) => coords)
    : [];

  return (
    <div className="relative">
      <svg
        viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
        className="w-full"
        role="img"
        aria-label="Hémicycle des votes"
      >
        {emptySeats.map(([x, y], i) => (
          <circle
            key={`empty-${i}`}
            cx={x}
            cy={y}
            r={SEAT_RADIUS}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={0.3}
          />
        ))}

        {/* Podium du président */}
        <circle
          cx={VIEW_CX}
          cy={VIEW_MAX_Y + PODIUM_OFFSET_Y}
          r={PODIUM_RADIUS}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={0.4}
        />
        <text
          x={VIEW_CX}
          y={VIEW_MAX_Y + PODIUM_LABEL_OFFSET_Y}
          textAnchor="middle"
          fontSize="2"
          fill="#94a3b8"
        >
          P
        </text>

        {positioned.map(({ seat, x, y }) => (
          <circle
            key={seat.officialId}
            cx={x}
            cy={y}
            r={SEAT_RADIUS}
            fill={POSITION_COLORS[seat.position]}
            stroke="white"
            strokeWidth={0.3}
            className="cursor-pointer"
            onMouseEnter={(e) => handleMouseEnter(seat, x, y, e)}
            onMouseLeave={handleMouseLeave}
          />
        ))}
      </svg>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-600 dark:bg-slate-800"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -120%)',
          }}
        >
          <p className="font-semibold text-slate-800 dark:text-white">
            {tooltip.seat.firstName} {tooltip.seat.lastName}
          </p>
          <p className="text-slate-500 dark:text-slate-400">
            {tooltip.seat.politicalGroup ?? 'Sans groupe'}
          </p>
          <p
            style={{ color: POSITION_COLORS[tooltip.seat.position] }}
            className="font-semibold"
          >
            {POSITION_LABELS[tooltip.seat.position]}
          </p>
        </div>
      )}

      <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-slate-600 dark:text-slate-400">
        {(Object.entries(POSITION_LABELS) as [VotePosition, string][]).map(
          ([position, label]) => (
            <span key={position} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: POSITION_COLORS[position] }}
              />
              {label}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
