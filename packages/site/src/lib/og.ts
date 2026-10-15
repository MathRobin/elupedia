/**
 * Pipeline de rendu des images Open Graph (1200×630) : un arbre React décrit
 * avec `createElement` est converti en SVG par satori, puis rastérisé en PNG
 * par resvg. Appelé par les endpoints `pages/api/og/*.png.ts`.
 *
 * Pièges :
 * - satori ne gère qu'un sous-ensemble de CSS (flexbox uniquement, chaque
 *   `div` doit avoir `display: flex` s'il contient plusieurs enfants).
 * - Les polices sont téléchargées depuis Google Fonts au premier rendu puis
 *   gardées en mémoire : le premier appel d'une instance serverless est lent.
 * - satori charge `hb.wasm` via le système de fichiers : voir `includeFiles`
 *   dans astro.config.ts pour le déploiement Vercel.
 */
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { ReactNode } from 'react';

let fontCache: ArrayBuffer | null = null;
let fontBoldCache: ArrayBuffer | null = null;

/**
 * Télécharge la police Inter pour une graisse donnée. On passe par la feuille
 * CSS de Google Fonts pour en extraire l'URL du fichier : sans en-tête
 * `User-Agent` de navigateur moderne, Google sert un TTF, format que satori
 * sait lire (contrairement au woff2 servi aux navigateurs récents).
 */
async function loadFont(weight: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`;
  const css = await fetch(url).then((response) => response.text());
  const match = css.match(/src:\s*url\(([^)]+)\)/);
  if (!match)
    throw new Error(`Could not extract font URL for weight ${weight}`);
  return fetch(match[1]).then((response) => response.arrayBuffer());
}

async function getFonts(): Promise<ArrayBuffer[]> {
  if (!fontCache) fontCache = await loadFont('400');
  if (!fontBoldCache) fontBoldCache = await loadFont('700');
  return [fontCache, fontBoldCache];
}

/**
 * Rend un arbre React en PNG 1200×630 (dimensions standard des cartes Open
 * Graph). Effet de bord : appels réseau vers Google Fonts au premier rendu.
 */
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
