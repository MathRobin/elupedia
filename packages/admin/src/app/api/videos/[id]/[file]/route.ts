/**
 * Sert au navigateur un fichier produit par le pipeline de shorts (vidéo,
 * vignette, texte) depuis le disque de la machine de rendu, pour la page de
 * détail de l'admin. Noms de fichiers sur liste blanche, identifiant UUID
 * exigé ; la session est vérifiée ici en plus du middleware. Les requêtes
 * `Range` sont honorées pour que la lecture vidéo puisse se positionner.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { auth } from '@/lib/auth';
import {
  SHORT_FILES,
  shortFilePath,
  type ShortFileName,
} from '@/lib/shorts-files';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; file: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { id, file } = await context.params;
  const filePath = shortFilePath(id, file);
  if (!filePath) return new Response('Not found', { status: 404 });

  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const contentType = SHORT_FILES[file as ShortFileName];

  const range = request.headers.get('range');
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range) {
    const m = range.match(/^bytes=(\d*)-(\d*)$/);
    if (m) {
      if (m[1]) start = Number(m[1]);
      if (m[2]) end = Number(m[2]);
      if (!m[1] && m[2]) {
        start = Math.max(0, size - Number(m[2]));
        end = size - 1;
      }
      if (start > end || end >= size) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` },
        });
      }
      status = 206;
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
  };
  if (status === 206)
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;

  const stream = Readable.toWeb(
    createReadStream(filePath, { start, end }),
  ) as ReadableStream;
  return new Response(stream, { status, headers });
}
