import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  alignWords,
  internalPauses,
  parseSilences,
  speechSpan,
} from './audio-align.js';
import type { WordTiming } from './words.js';

const execFileAsync = promisify(execFile);

/**
 * Outils audio : ffmpeg / ffprobe du système s'ils existent (ou FFMPEG_PATH /
 * FFPROBE_PATH), sinon ceux embarqués par Remotion (`@remotion/compositor-*`).
 */
let cached: { ffmpeg: string; ffprobe: string } | null = null;

export function findFfTools(): { ffmpeg: string; ffprobe: string } {
  if (cached) return cached;
  if (process.env.FFMPEG_PATH && process.env.FFPROBE_PATH) {
    cached = {
      ffmpeg: process.env.FFMPEG_PATH,
      ffprobe: process.env.FFPROBE_PATH,
    };
    return cached;
  }
  const require = createRequire(import.meta.url);
  const renderer = path.dirname(
    require.resolve('@remotion/renderer/package.json'),
  );
  const scope = path.join(renderer, '..');
  const dirs = readdirSync(scope).filter((d) => d.startsWith('compositor-'));
  if (dirs.length === 0) {
    throw new Error(
      'ffmpeg introuvable : installer ffmpeg ou définir FFMPEG_PATH et FFPROBE_PATH',
    );
  }
  const dir = path.join(scope, dirs[0]);
  cached = {
    ffmpeg: path.join(dir, 'ffmpeg'),
    ffprobe: path.join(dir, 'ffprobe'),
  };
  return cached;
}

async function run(bin: string, args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      maxBuffer: 32 * 1024 * 1024,
    });
    return `${stdout}\n${stderr}`;
  } catch (error) {
    const e = error as { stderr?: string; message: string };
    throw new Error(
      `${path.basename(bin)} a échoué : ${(e.stderr ?? e.message).slice(-400)}`,
      { cause: error },
    );
  }
}

export async function probeDuration(file: string): Promise<number> {
  const out = await run(findFfTools().ffprobe, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ]);
  const d = Number.parseFloat(out.trim().split('\n')[0]);
  if (!Number.isFinite(d)) throw new Error(`durée illisible pour ${file}`);
  return d;
}

export async function detectSilences(file: string, noiseDb = -35) {
  const out = await run(findFfTools().ffmpeg, [
    '-hide_banner',
    '-nostats',
    '-i',
    file,
    '-af',
    `silencedetect=noise=${noiseDb}dB:d=0.2`,
    '-f',
    'null',
    '-',
  ]);
  return parseSilences(out);
}

export interface ProcessedRecording {
  durationSec: number;
  words: WordTiming[];
}

/** Marge conservée autour de la parole après recadrage. */
const PAD_SEC = 0.15;

/**
 * Prépare un enregistrement : recadre le silence de tête et de queue, mono
 * 44,1 kHz, volume normalisé (loudnorm, -16 LUFS, usuel pour la vidéo en
 * ligne), écrit en WAV 16 bits ; puis horodate les mots du script dessus.
 */
export async function processRecording(
  src: string,
  dest: string,
  text: string,
): Promise<ProcessedRecording> {
  const rawDuration = await probeDuration(src);
  const rawSpan = speechSpan(await detectSilences(src), rawDuration);
  if (rawSpan.end - rawSpan.start < 0.3) {
    throw new Error(
      `${path.basename(src)} ne contient presque pas de parole (silence détecté)`,
    );
  }
  const from = Math.max(0, rawSpan.start - PAD_SEC);
  const to = Math.min(rawDuration, rawSpan.end + PAD_SEC);
  await run(findFfTools().ffmpeg, [
    '-hide_banner',
    '-nostats',
    '-y',
    '-i',
    src,
    '-ss',
    from.toFixed(3),
    '-t',
    (to - from).toFixed(3),
    '-af',
    'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-ac',
    '1',
    '-ar',
    '44100',
    '-c:a',
    'pcm_s16le',
    dest,
  ]);
  const durationSec = await probeDuration(dest);
  const span = speechSpan(await detectSilences(dest), durationSec);
  const pauses = internalPauses(await detectSilences(dest), span);
  return {
    durationSec: Math.round(durationSec * 100) / 100,
    words: alignWords(text, span, pauses),
  };
}
