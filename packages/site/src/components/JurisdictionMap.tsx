import { DEPARTMENTS, VIEWBOX } from '../lib/france-map-paths.js';

type PinProps = {
  latitude: number;
  longitude: number;
  label: string;
};

type DeptProps = {
  departmentCode: string;
  label: string;
};

type Props = PinProps | DeptProps;

function gpsToSvg(lat: number, lon: number): { x: number; y: number } {
  const mercY = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return {
    x: 52.4806 * lon + 1.4327 * lat + -0.2326 * lon * lat + 148.5829,
    y: -17.884 * lon + -2417.0217 * mercY + 19.1592 * lon * mercY + 2509.0602,
  };
}

function isPin(props: Props): props is PinProps {
  return 'latitude' in props;
}

export default function JurisdictionMap(props: Props) {
  const pin = isPin(props) ? gpsToSvg(props.latitude, props.longitude) : null;
  const highlightId = !isPin(props) ? props.departmentCode : null;

  return (
    <div className="relative">
      <svg viewBox={VIEWBOX} className="w-full h-auto" aria-label={props.label}>
        {DEPARTMENTS.map((dept) => {
          const highlighted = dept.id === highlightId;
          return (
            <path
              key={dept.id}
              d={dept.path}
              fill={highlighted ? '#818cf8' : '#f1f5f9'}
              stroke={highlighted ? '#4f46e5' : '#cbd5e1'}
              strokeWidth={highlighted ? 1.5 : 0.5}
              className={
                highlighted
                  ? 'dark:fill-indigo-500 dark:stroke-indigo-400'
                  : 'dark:fill-slate-700 dark:stroke-slate-600'
              }
            />
          );
        })}
        {pin && (
          <>
            <circle
              cx={pin.x}
              cy={pin.y}
              r={16}
              fill="#6366f1"
              fillOpacity={0.15}
              stroke="none"
            />
            <circle
              cx={pin.x}
              cy={pin.y}
              r={8}
              fill="#6366f1"
              stroke="#fff"
              strokeWidth={3}
              className="dark:stroke-slate-800"
            />
          </>
        )}
      </svg>
    </div>
  );
}
