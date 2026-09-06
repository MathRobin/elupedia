import { useState, useMemo, useCallback } from 'react';

type VotePosition = 'for' | 'against' | 'abstain' | 'absent';

interface Seat {
  officialId: string;
  firstName: string;
  lastName: string;
  position: VotePosition;
  politicalGroup: string | null;
  slug: string | null;
}

interface Props {
  seats: Seat[];
}

const GROUP_ORDER: string[] = [
  'La France insoumise - Nouveau Front Populaire (LFI-NFP)',
  'Gauche Démocrate et Républicaine (GDR)',
  'Socialistes et apparentés (SOC)',
  'Écologiste et Social (EcoS)',
  'Libertés, Indépendants, Outre-mer et Territoires (LIOT)',
  'Les Démocrates (Dem)',
  'Ensemble pour la République (EPR)',
  'Horizons & Indépendants (HOR)',
  'Droite Républicaine (DR)',
  'UDR (UDR)',
  'À Droite ! (AD)',
  'Rassemblement National (RN)',
  'Non inscrit (NI)',
];

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

function computeLayout(total: number) {
  if (total === 0) return { positions: [], outerRadius: 10, dotRadius: 0.5 };

  const dotDiameter = 1.0;
  const gap = 0.25;
  const step = dotDiameter + gap;
  const arcPad = 0.12;
  const arcSpan = Math.PI - 2 * arcPad;

  let bestRows = 1;
  let bestInner = 5;

  for (let rows = 2; rows <= 25; rows++) {
    const inner = rows * step * 1.1;
    let capacity = 0;
    for (let r = 0; r < rows; r++) {
      const radius = inner + r * step;
      const arcLen = arcSpan * radius;
      capacity += Math.floor(arcLen / step);
    }
    if (capacity >= total) {
      bestRows = rows;
      bestInner = inner;
      break;
    }
  }

  const rowRadii: number[] = [];
  const rawCaps: number[] = [];
  for (let r = 0; r < bestRows; r++) {
    const radius = bestInner + r * step;
    rowRadii.push(radius);
    rawCaps.push(Math.floor((arcSpan * radius) / step));
  }

  const rawTotal = rawCaps.reduce((a, b) => a + b, 0);
  const seatsPerRow = rawCaps.map((c) => Math.round((c / rawTotal) * total));

  let diff = total - seatsPerRow.reduce((a, b) => a + b, 0);
  let idx = seatsPerRow.length - 1;
  while (diff !== 0) {
    const d = diff > 0 ? 1 : -1;
    if (seatsPerRow[idx] + d >= 1) {
      seatsPerRow[idx] += d;
      diff -= d;
    }
    idx = (idx - 1 + seatsPerRow.length) % seatsPerRow.length;
  }

  const positions: { x: number; y: number }[] = [];

  for (let row = 0; row < bestRows; row++) {
    const radius = rowRadii[row];
    const n = seatsPerRow[row];
    if (n <= 0) continue;
    for (let col = 0; col < n; col++) {
      const t = n === 1 ? 0.5 : col / (n - 1);
      const angle = Math.PI - arcPad - arcSpan * t;
      positions.push({
        x: radius * Math.cos(angle),
        y: -radius * Math.sin(angle),
      });
    }
  }

  const outerRadius = rowRadii[bestRows - 1] + step;
  const dotRadius = dotDiameter / 2;

  return { positions, outerRadius, dotRadius };
}

export default function HemicycleChart({ seats }: Props) {
  const [tooltip, setTooltip] = useState<{
    seat: Seat;
    x: number;
    y: number;
  } | null>(null);

  const sortedSeats = useMemo(() => {
    const groupIndex = (g: string | null) => {
      if (!g) return GROUP_ORDER.length;
      const idx = GROUP_ORDER.indexOf(g);
      return idx >= 0 ? idx : GROUP_ORDER.length - 0.5;
    };
    return [...seats].sort(
      (a, b) => groupIndex(a.politicalGroup) - groupIndex(b.politicalGroup),
    );
  }, [seats]);

  const { positions, outerRadius, dotRadius } = useMemo(
    () => computeLayout(sortedSeats.length),
    [sortedSeats.length],
  );

  const margin = 1.5;
  const viewBoxX = -(outerRadius + margin);
  const viewBoxY = -(outerRadius + margin);
  const viewBoxW = (outerRadius + margin) * 2;
  const viewBoxH = outerRadius + margin + dotRadius + 0.5;

  const handleMouseEnter = useCallback(
    (seat: Seat, pos: { x: number; y: number }, e: React.MouseEvent) => {
      const svg = (e.target as SVGElement).closest('svg')!;
      const rect = svg.getBoundingClientRect();
      const pxX = ((pos.x - viewBoxX) / viewBoxW) * rect.width;
      const pxY = ((pos.y - viewBoxY) / viewBoxH) * rect.height;
      setTooltip({ seat, x: pxX, y: pxY });
    },
    [viewBoxX, viewBoxY, viewBoxW, viewBoxH],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  if (sortedSeats.length === 0) return null;

  return (
    <div className="relative">
      <svg
        viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`}
        className="w-full"
        role="img"
        aria-label="Hémicycle des votes"
      >
        {sortedSeats.map((seat, i) => {
          const pos = positions[i];
          if (!pos) return null;
          return (
            <circle
              key={seat.officialId}
              cx={pos.x}
              cy={pos.y}
              r={dotRadius}
              fill={POSITION_COLORS[seat.position]}
              stroke="white"
              strokeWidth={0.12}
              className="cursor-pointer"
              onMouseEnter={(e) => handleMouseEnter(seat, pos, e)}
              onMouseLeave={handleMouseLeave}
            />
          );
        })}
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
