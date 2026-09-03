import { useState, useCallback, useRef, useEffect } from 'react';
import { DEPARTMENTS, VIEWBOX } from '../lib/france-map-paths.js';

type DepartmentVotes = {
  for: number;
  against: number;
  abstain: number;
  absent: number;
};

type Props = {
  votesByDept: Record<string, DepartmentVotes>;
  deptNames: Record<string, string>;
  selectedDept: string | null;
  onSelect: (deptCode: string | null) => void;
};

const POSITION_COLORS = {
  for: '#10b981',
  against: '#ef4444',
  abstain: '#fbbf24',
  absent: '#cbd5e1',
};

const POSITION_LABELS: Record<string, string> = {
  for: 'Pour',
  against: 'Contre',
  abstain: 'Abstention',
  absent: 'Absent',
};

function dominantColor(v: DepartmentVotes): string {
  const total = v.for + v.against + v.abstain + v.absent;
  if (total === 0) return '#f1f5f9';
  const max = Math.max(v.for, v.against, v.abstain, v.absent);
  if (max === v.for) return '#d1fae5';
  if (max === v.against) return '#fee2e2';
  if (max === v.abstain) return '#fef3c7';
  return '#f1f5f9';
}

export default function FranceDepartmentMap({
  votesByDept,
  deptNames,
  selectedDept,
  onSelect,
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const hoveredData = hovered ? votesByDept[hovered] : null;
  const hoveredName = hovered ? deptNames[hovered] : null;

  useEffect(() => {
    if (selectedDept) {
      document.dispatchEvent(
        new CustomEvent('dept-filter', { detail: selectedDept }),
      );
    } else {
      document.dispatchEvent(new CustomEvent('dept-filter', { detail: null }));
    }
  }, [selectedDept]);

  return (
    <div ref={containerRef} className="relative">
      <svg
        viewBox={VIEWBOX}
        className="w-full h-auto"
        onMouseLeave={() => {
          setHovered(null);
          setTooltip(null);
        }}
      >
        {DEPARTMENTS.map((dept) => {
          const votes = votesByDept[dept.id];
          const fill = votes ? dominantColor(votes) : '#f1f5f9';
          const isSelected = selectedDept === dept.id;
          const isHovered = hovered === dept.id;

          return (
            <path
              key={dept.id}
              d={dept.path}
              fill={isSelected ? '#818cf8' : fill}
              stroke={isHovered || isSelected ? '#312e81' : '#1e293b'}
              strokeWidth={isHovered || isSelected ? 1.5 : 0.5}
              className="cursor-pointer transition-colors"
              onMouseEnter={() => setHovered(dept.id)}
              onMouseMove={handleMouseMove}
              onClick={() =>
                onSelect(selectedDept === dept.id ? null : dept.id)
              }
            />
          );
        })}
      </svg>

      {hovered && hoveredData && tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-slate-600 dark:bg-slate-800"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            transform: 'translateY(-100%)',
          }}
        >
          <p className="font-semibold text-slate-800 dark:text-white">
            {hoveredName} ({hovered})
          </p>
          <div className="mt-1 space-y-0.5">
            {(['for', 'against', 'abstain', 'absent'] as const).map((pos) => (
              <div key={pos} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: POSITION_COLORS[pos] }}
                />
                <span className="text-slate-600 dark:text-slate-300">
                  {POSITION_LABELS[pos]}
                </span>
                <span className="ml-auto font-medium tabular-nums text-slate-800 dark:text-white">
                  {hoveredData[pos]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedDept && (
        <button
          onClick={() => onSelect(null)}
          className="absolute top-2 right-2 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow ring-1 ring-slate-900/5 hover:bg-slate-50 transition-colors dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
        >
          Réinitialiser la carte
        </button>
      )}
    </div>
  );
}
