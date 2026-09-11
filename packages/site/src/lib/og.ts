import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { ReactNode } from 'react';

let fontCache: ArrayBuffer | null = null;
let fontBoldCache: ArrayBuffer | null = null;

async function loadFont(weight: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`;
  const css = await fetch(url).then((r) => r.text());
  const match = css.match(/src:\s*url\(([^)]+)\)/);
  if (!match)
    throw new Error(`Could not extract font URL for weight ${weight}`);
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

async function getFonts(): Promise<ArrayBuffer[]> {
  if (!fontCache) fontCache = await loadFont('400');
  if (!fontBoldCache) fontBoldCache = await loadFont('700');
  return [fontCache, fontBoldCache];
}

export async function renderOgImage(element: ReactNode): Promise<Buffer> {
  const [regular, bold] = await getFonts();

  const svg = await satori(element, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Inter', data: regular, weight: 400, style: 'normal' },
      { name: 'Inter', data: bold, weight: 700, style: 'normal' },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  });

  return resvg.render().asPng();
}
