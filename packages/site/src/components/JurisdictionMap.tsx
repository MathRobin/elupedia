/**
 * Mini-carte de France statique localisant la circonscription d'un élu :
 * soit un département mis en surbrillance (sénateurs), soit une épingle GPS
 * (députés, à partir des coordonnées de la circonscription).
 *
 * Rendue sur `pages/elus/[slug]/index.astro` SANS directive `client:*` : le
 * composant n'a ni état ni handler, il est donc rendu côté serveur en SVG pur
 * et n'embarque aucun JavaScript côté client.
 *
 * Les tracés proviennent de `lib/france-map-paths.ts` (métropole seulement :
 * un élu d'outre-mer n'aura pas de département surligné).
 */
import { DEPARTMENTS, VIEWBOX } from '../lib/france-map-paths.js';

/** Variante « épingle » : position GPS d'une circonscription. */
type PinProps = {
  latitude: number;
  longitude: number;
  /** Libellé accessible du SVG (aria-label). */
  label: string;
  /** Couleur d'accent (ex. couleur du groupe politique) ; indigo par défaut. */
  color?: string;
};

/** Variante « département » : code INSEE à mettre en surbrillance. */
type DeptProps = {
  departmentCode: string;
  label: string;
  color?: string;
};

type Props = PinProps | DeptProps;

/** Indigo-500, utilisé quand la page ne fournit pas de couleur de groupe. */
const DEFAULT_ACCENT = '#6366f1';
/** Rayon du halo translucide autour de l'épingle, en unités du viewBox. */
const PIN_HALO_RADIUS = 16;
/** Rayon du point plein de l'épingle, en unités du viewBox. */
const PIN_RADIUS = 8;

/**
 * Projette des coordonnées GPS dans le repère du viewBox de
 * `france-map-paths`. Les coefficients sont une régression bilinéaire
 * (lon, lat, lon·lat, y de Mercator) calée empiriquement sur la carte source :
 * ils sont indissociables de ces tracés et doivent être recalibrés si on
 * change de fond de carte.
 */
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
  const accent = props.color ?? DEFAULT_ACCENT;

  return (
    <div className="relative">
      <svg viewBox={VIEWBOX} className="w-full h-auto" aria-label={props.label}>
        {DEPARTMENTS.map((dept) => {
          const highlighted = dept.id === highlightId;
          return (
            <path
              key={dept.id}
              d={dept.path}
              fill={highlighted ? accent : '#f1f5f9'}
              stroke={highlighted ? accent : '#cbd5e1'}
              strokeWidth={highlighted ? 1.5 : 0.5}
              fillOpacity={highlighted ? 0.6 : 1}
              className={
                highlighted ? '' : 'dark:fill-slate-700 dark:stroke-slate-600'
              }
            />
          );
        })}
        {pin && (
          <>
            <circle
              cx={pin.x}
              cy={pin.y}
              r={PIN_HALO_RADIUS}
              fill={accent}
              fillOpacity={0.15}
              stroke="none"
            />
            <circle
              cx={pin.x}
              cy={pin.y}
              r={PIN_RADIUS}
              fill={accent}
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
