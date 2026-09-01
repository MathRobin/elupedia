import StaticMaps from 'staticmaps';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'static-maps');

const MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="32" viewBox="0 0 20 32">
  <path d="M10 0C4.5 0 0 4.5 0 10c0 7.5 10 22 10 22s10-14.5 10-22C20 4.5 15.5 0 10 0z" fill="#4F46E5"/>
  <circle cx="10" cy="10" r="4" fill="white"/>
</svg>`;

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

export async function generateStaticMap(
  opts: MapOptions,
): Promise<Buffer | null> {
  const resolved = {
    latitude: opts.latitude,
    longitude: opts.longitude,
    zoom: opts.zoom ?? 13,
    width: opts.width ?? 400,
    height: opts.height ?? 200,
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
    height: 32,
    width: 20,
    offsetX: 10,
    offsetY: 32,
  });

  await map.render([resolved.longitude, resolved.latitude], resolved.zoom);
  const buffer = await map.image.buffer('image/png');

  writeFileSync(cached, buffer);
  return buffer;
}
