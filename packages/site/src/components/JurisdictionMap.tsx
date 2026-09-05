import { DEPARTMENTS, VIEWBOX } from '../lib/france-map-paths.js';

type Props = {
  latitude: number;
  longitude: number;
  label: string;
};

function gpsToSvg(lat: number, lon: number): { x: number; y: number } {
  return {
    x: 40.5953 * lon + 2.6803 * lat + 75.9066,
    y: 1.234 * lon + -53.6021 * lat + 2759.8521,
  };
}

export default function JurisdictionMap({ latitude, longitude, label }: Props) {
  const { x, y } = gpsToSvg(latitude, longitude);

  return (
    <div className="relative">
      <svg viewBox={VIEWBOX} className="w-full h-auto" aria-label={label}>
        {DEPARTMENTS.map((dept) => (
          <path
            key={dept.id}
            d={dept.path}
            fill="#f1f5f9"
            stroke="#cbd5e1"
            strokeWidth={0.5}
            className="dark:fill-slate-700 dark:stroke-slate-600"
          />
        ))}
        <circle
          cx={x}
          cy={y}
          r={8}
          fill="#6366f1"
          stroke="#fff"
          strokeWidth={3}
          className="dark:stroke-slate-800"
        />
        <circle
          cx={x}
          cy={y}
          r={16}
          fill="#6366f1"
          fillOpacity={0.15}
          stroke="none"
        />
      </svg>
    </div>
  );
}
