/**
 * Génération de cartes statiques PNG (fond OpenStreetMap + marqueur) pour
 * les adresses géocodées, via la bibliothèque `staticmaps`. Utilisé par
 * upsert/upload-maps.ts, qui envoie ensuite le PNG sur S3.
 *
 * Les rendus sont mis en cache sur disque (node_modules/.cache/static-maps,
 * clé = md5 des paramètres) : le rendu télécharge des tuiles OSM, dont les
 * conditions d'usage interdisent les téléchargements massifs répétés.
 * L'appelant utilise la même clé (mapCacheKey) pour nommer l'objet S3.
 */
import StaticMaps from 'staticmaps';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'static-maps');

// Rendu par défaut : vignette 400×200 au niveau quartier.
const DEFAULT_ZOOM = 13;
const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 200;
// Dimensions du marqueur SVG ci-dessous ; offset = pointe en bas au centre.
const MARKER_WIDTH = 20;
const MARKER_HEIGHT = 32;

const MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="32" viewBox="0 0 20 32">
  <path d="M10 0C4.5 0 0 4.5 0 10c0 7.5 10 22 10 22s10-14.5 10-22C20 4.5 15.5 0 10 0z" fill="#4F46E5"/>
  <circle cx="10" cy="10" r="4" fill="white"/>
</svg>`;

// `staticmaps` ne lit le marqueur que depuis un fichier : écrit une fois
// dans le cache.
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

/** Clé de cache (et nom d'objet S3) déterministe pour un rendu donné. */
export function mapCacheKey(opts: {
  latitude: number;
  longitude: number;
  zoom: number;
  width: number;
  height: number;
}): string {
  const raw = `${opts.latitude}_${opts.longitude}_${opts.zoom}_${opts.width}x${opts.height}`;
  return createHash('md5').update(raw).digest('hex');
}

/**
 * Rend (ou relit du cache) la carte PNG centrée sur le point. Appels réseau
 * vers tile.openstreetmap.org en cas de cache manquant.
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
  const key = mapCacheKey(resolved);
  const cached = join(CACHE_DIR, `${key}.png`);

  if (existsSync(cached)) {
    return readFileSync(cached);
  }

  const markerPath = ensureMarkerFile();

  const map = new StaticMaps({
    width: resolved.width,
    height: resolved.height,
    tileSize: 256,
    tileLayers: [
      {
        tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      },
    ],
  });

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

  writeFileSync(cached, buffer);
  return buffer;
}
