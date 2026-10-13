import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { videoShorts } from '@elupedia/shared';
import { logger } from './logger.js';
import type { StoredScript } from './generate-script.js';
import type { ShortScript } from './script-schema.js';
import { MAX_WORDS_PER_SEC, countWords } from './script-validate.js';
import { processRecording, type ProcessedRecording } from './audio.js';
import type { WordTiming } from './words.js';

/**
 * Voix off enregistrée par l'équipe : une fiche de lecture par short, un
 * fichier audio par scène, importé (recadré, normalisé, horodaté) dans
 * `video_shorts.voiceover`. Le rendu cale ensuite chaque scène sur son audio.
 */

export interface VoiceoverScene {
  sceneId: string;
  /** Chemin du WAV, relatif à `outputDir` ; vide = sous-titres sans audio. */
  file: string;
  durationSec: number;
  words: WordTiming[];
}

export interface StoredVoiceover {
  version: 1;
  generatedAt: string;
  /** `recorded` (voix enregistrée) ou `estimated` (sous-titres seuls, rendu muet). */
  provider: string;
  voiceId: string;
  modelId: string;
  outputDir: string;
  scenes: VoiceoverScene[];
}

export const DEFAULT_OUTPUT_DIR = 'out';
export const RECORDING_EXTENSIONS = ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg'];

export function spokenScenes(script: ShortScript) {
  return script.scenes.filter((s) => s.voiceover.trim().length > 0);
}

/** Fiche de lecture : ce qu'il faut lire, dans quel fichier, en combien de temps. */
export function readingSheet(shortId: string, script: ShortScript): string {
  const lines = [
    `Fiche de lecture — ${script.title}`,
    `Short ${shortId}`,
    '',
    `Enregistrer une prise par scène, nommée scene-<identifiant>.wav (mp3, m4a, flac acceptés),`,
    `dans le dossier recordings/ du short. Débit visé : ${MAX_WORDS_PER_SEC} mots par seconde au plus,`,
    'voix posée, une courte pause entre deux phrases (elle sert à caler les sous-titres).',
    '',
  ];
  for (const scene of spokenScenes(script)) {
    const words = countWords(scene.voiceover);
    lines.push(
      `── scene-${scene.id} · ${scene.durationSec} s prévues · ${words} mots`,
      scene.voiceover,
      '',
    );
  }
  return lines.join('\n');
}

export function findRecording(
  files: string[],
  sceneId: string,
): string | undefined {
  const wanted = `scene-${sceneId}`.toLowerCase();
  return files.find((f) => {
    const ext = path.extname(f).slice(1).toLowerCase();
    return (
      RECORDING_EXTENSIONS.includes(ext) &&
      path.basename(f, path.extname(f)).toLowerCase() === wanted
    );
  });
}

export interface ImportOptions {
  /** Dossier des prises ; défaut : `<outputDir>/<shortId>/recordings`. */
  from?: string;
  outputDir: string;
}

export async function importRecordings(
  shortId: string,
  script: ShortScript,
  options: ImportOptions,
  process_: typeof processRecording = processRecording,
): Promise<StoredVoiceover> {
  const dir =
    options.from ?? path.join(options.outputDir, shortId, 'recordings');
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (error) {
    throw new Error(`dossier des prises introuvable : ${dir}`, {
      cause: error,
    });
  }
  const scenes = spokenScenes(script);
  const missing = scenes.filter((s) => !findRecording(files, s.id));
  if (missing.length > 0) {
    throw new Error(
      `prises manquantes dans ${dir} : ${missing.map((s) => `scene-${s.id}`).join(', ')}`,
    );
  }

  const outDir = path.join(options.outputDir, shortId);
  await mkdir(outDir, { recursive: true });
  const result: VoiceoverScene[] = [];
  for (const scene of scenes) {
    const src = path.join(dir, findRecording(files, scene.id)!);
    const file = path.join(shortId, `scene-${scene.id}.wav`);
    const processed: ProcessedRecording = await process_(
      src,
      path.join(options.outputDir, file),
      scene.voiceover,
    );
    result.push({
      sceneId: scene.id,
      file,
      durationSec: processed.durationSec,
      words: processed.words,
    });
    if (processed.durationSec > scene.durationSec) {
      logger.warn(
        `scène ${scene.id} : ${processed.durationSec.toFixed(1)} s enregistrées pour ${scene.durationSec} s prévues, le rendu allongera la scène`,
      );
    }
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    provider: 'recorded',
    voiceId: '',
    modelId: '',
    outputDir: path.resolve(options.outputDir),
    scenes: result,
  };
}

export interface SheetTarget {
  id: string;
  script: StoredScript;
}

/** Shorts à lire : script prêt (draft), pas encore de voix, ou un short précis. */
export async function loadReadingTargets(
  db: NeonHttpDatabase,
  shortId?: string,
): Promise<SheetTarget[]> {
  const rows = shortId
    ? await db
        .select({ id: videoShorts.id, script: videoShorts.script })
        .from(videoShorts)
        .where(eq(videoShorts.id, shortId))
    : await db
        .select({ id: videoShorts.id, script: videoShorts.script })
        .from(videoShorts)
        .where(
          and(
            eq(videoShorts.status, 'draft'),
            isNotNull(videoShorts.script),
            isNull(videoShorts.voiceover),
          ),
        );
  if (shortId && rows.length === 0) {
    throw new Error(`video_short ${shortId} introuvable`);
  }
  return rows
    .filter((r) => (r.script as StoredScript | null)?.script)
    .map((r) => ({ id: r.id, script: r.script as StoredScript }));
}

export async function writeReadingSheet(
  target: SheetTarget,
  outputDir: string,
): Promise<{ file: string; text: string }> {
  const text = readingSheet(target.id, target.script.script);
  const dir = path.join(outputDir, target.id);
  await mkdir(path.join(dir, 'recordings'), { recursive: true });
  const file = path.join(dir, 'lecture.txt');
  await writeFile(file, text);
  return { file, text };
}

export async function storeVoiceover(
  db: NeonHttpDatabase,
  shortId: string,
  voiceover: StoredVoiceover,
): Promise<void> {
  await db
    .update(videoShorts)
    .set({ voiceover, updatedAt: new Date() })
    .where(eq(videoShorts.id, shortId));
}
