/**
 * Fichiers produits par le pipeline de shorts (packages/shorts) : vidéo,
 * vignette, texte d'accompagnement. Ils vivent sur la machine qui rend les
 * vidéos, dans `SHORTS_OUTPUT_DIR` (absolu, ou relatif à packages/shorts),
 * sinon dans `packages/shorts/out`. L'admin les lit directement : elle tourne
 * sur la même machine. Utilisé par les actions de /videos et par la route
 * /api/videos/[id]/[file] qui les sert au navigateur.
 */
import { access } from 'node:fs/promises';
import path from 'node:path';

export const SHORT_FILES = {
  'short.mp4': 'video/mp4',
  'thumbnail.png': 'image/png',
  'description.txt': 'text/plain; charset=utf-8',
} as const;

export type ShortFileName = keyof typeof SHORT_FILES;

export function shortsOutputDir(): string {
  const shortsDir = path.resolve(process.cwd(), '..', 'shorts');
  const configured = process.env.SHORTS_OUTPUT_DIR;
  return configured
    ? path.resolve(shortsDir, configured)
    : path.join(shortsDir, 'out');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chemin absolu d'un fichier d'un short, null si le nom n'est pas autorisé. */
export function shortFilePath(shortId: string, file: string): string | null {
  if (!UUID.test(shortId) || !(file in SHORT_FILES)) return null;
  return path.join(shortsOutputDir(), shortId, file);
}

export async function shortFileExists(
  shortId: string,
  file: ShortFileName,
): Promise<boolean> {
  const p = shortFilePath(shortId, file);
  if (!p) return false;
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
