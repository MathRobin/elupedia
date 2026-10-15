/**
 * Carte de France cliquable colorée selon la position dominante des votes
 * (pour / contre / abstention / absent) de chaque département sur un scrutin.
 *
 * Toujours rendue via `DepartmentMapWrapper` (page `pages/scrutins/[id].astro`,
 * `client:load`), qui lui fournit l'état de sélection. Au survol, une
 * info-bulle détaille le décompte du département ; au clic, le département
 * est (dé)sélectionné.
 *
 * Effet de bord : chaque changement de sélection est diffusé sur `document`
 * par l'événement `dept-filter` (detail = code INSEE ou null), écouté par un
 * script inline de la page pour filtrer la liste nominative des votes. Un
 * événement `null` est aussi émis au montage.
 *
 * Métropole uniquement (cf. `lib/france-map-paths.ts`) : les votes des élus
 * d'outre-mer ne sont pas visibles sur la carte.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { DEPARTMENTS, VIEWBOX } from '../lib/france-map-paths.js';

type DepartmentVotes = {
  for: number;
  against: number;
  abstain: number;
  absent: number;
};

/** Props fournies par DepartmentMapWrapper. */
type Props = {
  /** Décompte des positions par code INSEE de département. */
  votesByDept: Record<string, DepartmentVotes>;
  /** Nom affichable de chaque département, par code INSEE. */
  deptNames: Record<string, string>;
  /** Code INSEE du département sélectionné (état contrôlé par le parent). */
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

/** Fond des départements sans vote (slate-100). */
const NO_VOTE_FILL = '#f1f5f9';
/** Décalage de l'info-bulle par rapport au curseur, en pixels. */
const TOOLTIP_OFFSET_X = 12;
const TOOLTIP_OFFSET_Y = -10;

/**
 * Teinte pastel de la position majoritaire du département. En cas d'égalité,
 * l'ordre de priorité est pour > contre > abstention > absent.
 */
function dominantColor(votes: DepartmentVotes): string {
  const total = votes.for + votes.against + votes.abstain + votes.absent;
  if (total === 0) return NO_VOTE_FILL;
  const max = Math.max(votes.for, votes.against, votes.abstain, votes.absent);
  if (max === votes.for) return '#d1fae5';
  if (max === votes.against) return '#fee2e2';
  if (max === votes.abstain) return '#fef3c7';
  return NO_VOTE_FILL;
}

export default function FranceDepartmentMap({
  votesByDept,
  deptNames,
  selectedDept,
  onSelect,
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  // Position de l'info-bulle, relative au conteneur.
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const hoveredData = hovered ? votesByDept[hovered] : null;
  const hoveredName = hovered ? deptNames[hovered] : null;

  // Diffuse la sélection à la page hôte (voir en-tête).
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
          const fill = votes ? dominantColor(votes) : NO_VOTE_FILL;
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
            left: tooltip.x + TOOLTIP_OFFSET_X,
            top: tooltip.y + TOOLTIP_OFFSET_Y,
            transform: 'translateY(-100%)',
          }}
        >
          <p className="font-semibold text-slate-800 dark:text-white">
            {hoveredName} ({hovered})
          </p>
          <div className="mt-1 space-y-0.5">
            {(['for', 'against', 'abstain', 'absent'] as const).map(
              (position) => (
                <div key={position} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: POSITION_COLORS[position] }}
                  />
                  <span className="text-slate-600 dark:text-slate-300">
                    {POSITION_LABELS[position]}
                  </span>
                  <span className="ml-auto font-medium tabular-nums text-slate-800 dark:text-white">
                    {hoveredData[position]}
                  </span>
                </div>
              ),
            )}
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
