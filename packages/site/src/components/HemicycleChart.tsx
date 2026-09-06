import { useState, useMemo, useCallback } from 'react';
import seatPositions from '../lib/hemicycle-seats.json';

type VotePosition = 'for' | 'against' | 'abstain' | 'absent';

interface Seat {
  officialId: string;
  firstName: string;
  lastName: string;
  position: VotePosition;
  politicalGroup: string | null;
  slug: string | null;
  seatNumber: number | null;
}

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

const seatMap = seatPositions as Record<string, [number, number]>;

const allCoords = Object.values(seatMap);
const VIEW_MIN_X = Math.min(...allCoords.map((c) => c[0]));
const VIEW_MAX_X = Math.max(...allCoords.map((c) => c[0]));
const VIEW_MIN_Y = Math.min(...allCoords.map((c) => c[1]));
const VIEW_MAX_Y = Math.max(...allCoords.map((c) => c[1]));
const VIEW_CX = (VIEW_MIN_X + VIEW_MAX_X) / 2;

const MARGIN = 6;
const VB_X = VIEW_MIN_X - MARGIN;
const VB_Y = VIEW_MIN_Y - MARGIN;
const VB_W = VIEW_MAX_X - VIEW_MIN_X + MARGIN * 2;
const VB_H = VIEW_MAX_Y - VIEW_MIN_Y + MARGIN * 2;

export default function HemicycleChart({ seats }: Props) {
  const [tooltip, setTooltip] = useState<{
    seat: Seat;
    x: number;
    y: number;
  } | null>(null);

  const hasSeatData = seats.some(
    (s) => s.seatNumber != null && seatMap[String(s.seatNumber)],
  );

  const positioned = useMemo(() => {
    if (hasSeatData) {
      const placed: { seat: Seat; x: number; y: number }[] = [];
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

      if (unplaced.length > 0) {
        const usedPositions = new Set(placed.map((p) => `${p.x},${p.y}`));
        const available = Object.values(seatMap).filter(
          (c) => !usedPositions.has(`${c[0]},${c[1]}`),
        );
        for (let i = 0; i < unplaced.length && i < available.length; i++) {
          placed.push({
            seat: unplaced[i],
            x: available[i][0],
            y: available[i][1],
          });
        }
      }

      return placed;
    }

    return seats.map((seat, i) => ({
      seat,
      x: allCoords[i % allCoords.length][0],
      y: allCoords[i % allCoords.length][1],
    }));
  }, [seats, hasSeatData]);

  const dotRadius = 2.8;

  const handleMouseEnter = useCallback(
    (seat: Seat, sx: number, sy: number, e: React.MouseEvent) => {
      const svg = (e.target as SVGElement).closest('svg')!;
      const rect = svg.getBoundingClientRect();
      const pxX = ((sx - VB_X) / VB_W) * rect.width;
      const pxY = ((sy - VB_Y) / VB_H) * rect.height;
      setTooltip({ seat, x: pxX, y: pxY });
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
            r={dotRadius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={0.4}
          />
        ))}

        {/* President podium */}
        <circle
          cx={VIEW_CX}
          cy={VIEW_MAX_Y + 2}
          r={3}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={0.5}
        />
        <text
          x={VIEW_CX}
          y={VIEW_MAX_Y + 3.2}
          textAnchor="middle"
          fontSize="2.5"
          fill="#94a3b8"
        >
          P
        </text>

        {positioned.map(({ seat, x, y }) => (
          <circle
            key={seat.officialId}
            cx={x}
            cy={y}
            r={dotRadius}
            fill={POSITION_COLORS[seat.position]}
            stroke="white"
            strokeWidth={0.4}
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
          ([pos, label]) => (
            <span key={pos} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: POSITION_COLORS[pos] }}
              />
              {label}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
