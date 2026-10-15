/**
 * Génère une carte statique OpenStreetMap (PNG) centrée sur un point, avec un
 * marqueur, et la met en cache sur disque dans `node_modules/.cache`.
 *
 * Attention : aucun appelant dans `packages/site` au moment de la rédaction ;
 * la version effectivement utilisée pour les cartes des fiches élus est
 * `packages/ingest/src/services/static-map.ts` (qui, elle, envoie les PNG sur
 * S3). Ce module semble être un vestige d'une génération au rendu.
 *
 * Effets de bord : appels réseau vers les tuiles OSM, écriture disque.
 */
import StaticMaps from 'staticmaps';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'static-maps');

const DEFAULT_ZOOM = 13;
const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 200;

/** Épingle indigo 20×32, pointe en bas : l'offset du marqueur place cette pointe sur la coordonnée. */
const MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="32" viewBox="0 0 20 32">
  <path d="M10 0C4.5 0 0 4.5 0 10c0 7.5 10 22 10 22s10-14.5 10-22C20 4.5 15.5 0 10 0z" fill="#4F46E5"/>
  <circle cx="10" cy="10" r="4" fill="white"/>
</svg>`;
const MARKER_WIDTH = 20;
const MARKER_HEIGHT = 32;

/** staticmaps veut un fichier image pour le marqueur : on l'écrit une fois dans le cache. */
function ensureMarkerFile(): string {
  mkdirSync(CACHE_DIR, { recursive: true });
  const path = join(CACHE_DIR, 'marker.svg');
  if (!existsSync(path)) writeFileSync(path, MARKER_SVG);
  return path;
}

export interface MapOptions {
  latitude: number;
  longitude: number;
  zoom?: number;
  width?: number;
  height?: number;
}

/** Clé de cache : md5 de `lat_lon_zoom_WxH` (cf. static-map.test.ts). */
function cacheKey(opts: Required<MapOptions>): string {
  const raw = `${opts.latitude}_${opts.longitude}_${opts.zoom}_${opts.width}x${opts.height}`;
  return createHash('md5').update(raw).digest('hex');
}

/**
 * Renvoie le PNG de la carte (depuis le cache disque si déjà généré), ou
 * `null` si le rendu échoue — l'appelant doit alors se passer de carte.
 */
export async function generateStaticMap(
  opts: MapOptions,
): Promise<Buffer | null> {
  const resolved = {
    latitude: opts.latitude,
    longitude: opts.longitude,
    zoom: opts.zoom ?? DEFAULT_ZOOM,
    width: opts.width ?? DEFAULT_WIDTH,
    height: opts.height ?? DEFAULT_HEIGHT,
  };

  mkdirSync(CACHE_DIR, { recursive: true });
  const key = cacheKey(resolved);
  const cachedPath = join(CACHE_DIR, `${key}.png`);

  if (existsSync(cachedPath)) {
    return readFileSync(cachedPath);
  }

  try {
    const markerPath = ensureMarkerFile();

    const map = new StaticMaps({
      width: resolved.width,
      height: resolved.height,
      tileLayers: [
        {
          tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          tileSize: 256,
        },
      ],
    });

    // staticmaps attend les coordonnées en [longitude, latitude] (ordre GeoJSON).
    map.addMarker({
      coord: [resolved.longitude, resolved.latitude],
      img: markerPath,
      height: MARKER_HEIGHT,
      width: MARKER_WIDTH,
      offsetX: MARKER_WIDTH / 2,
      offsetY: MARKER_HEIGHT,
    });

    await map.render([resolved.longitude, resolved.latitude], resolved.zoom);
    const buffer = await map.image.buffer('image/png');

    writeFileSync(cachedPath, buffer);
    return buffer;
  } catch (err) {
    console.error(
      `[static-map] Failed for ${resolved.latitude},${resolved.longitude}:`,
      err,
    );
    return null;
  }
}
