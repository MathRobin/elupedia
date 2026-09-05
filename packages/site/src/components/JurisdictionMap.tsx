import { DEPARTMENTS, VIEWBOX } from '../lib/france-map-paths.js';

type Props = {
  latitude: number;
  longitude: number;
  label: string;
};

function gpsToSvg(lat: number, lon: number): { x: number; y: number } {
  const mercY = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return {
    x: 52.4806 * lon + 1.4327 * lat + -0.2326 * lon * lat + 148.5829,
    y: -17.884 * lon + -2417.0217 * mercY + 19.1592 * lon * mercY + 2509.0602,
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
