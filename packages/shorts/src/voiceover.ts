import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { videoShorts } from '@elupedia/shared';
import { logger } from './logger.js';
import type { StoredScript } from './generate-script.js';
import type { ShortScript } from './script-schema.js';
import { MAX_WORDS_PER_SEC, countWords } from './script-validate.js';
import { processRecording, type ProcessedRecording } from './audio.js';
import type { TtsProvider } from './tts.js';
import type { WordTiming } from './words.js';

/**
 * Voix off d'un short : une prise audio par scène dans `recordings/`, soit
 * enregistrée par l'équipe (fiche de lecture `voiceover sheet`), soit
 * synthétisée par ElevenLabs (`voiceover generate`, tts.ts) ; puis importée
 * (recadrée, normalisée, horodatée) dans `video_shorts.voiceover`. Le rendu
 * cale ensuite chaque scène sur son audio. Une prise synthétisée est
 * accompagnée d'un `scene-<id>.words.json` (horodatage exact des mots) que
 * l'import préfère à l'estimation par pauses.
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
  /** `recorded` (voix enregistrée), `elevenlabs` (synthèse) ou `estimated` (sous-titres seuls, rendu muet). */
  provider: string;
  voiceId: string;
  modelId: string;
  outputDir: string;
  scenes: VoiceoverScene[];
}

export const DEFAULT_OUTPUT_DIR = 'out';
export const RECORDING_EXTENSIONS = ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg'];

/** Fichier compagnon d'une prise synthétisée : `scene-<id>.words.json`. */
export interface TakeWords {
  provider: string;
  voiceId: string;
  modelId: string;
  words: WordTiming[];
}

export function takeWordsFile(dir: string, sceneId: string): string {
  return path.join(dir, `scene-${sceneId}.words.json`);
}

async function readTakeWords(
  dir: string,
  sceneId: string,
): Promise<TakeWords | null> {
  try {
    const parsed = JSON.parse(
      await readFile(takeWordsFile(dir, sceneId), 'utf-8'),
    ) as TakeWords;
    return Array.isArray(parsed.words) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Synthétise les prises d'un short dans `recordings/` (MP3 + `.words.json`),
 * à la place de l'enregistrement par l'équipe. `only` restreint aux scènes
 * citées (prises manquantes) ; sinon toutes les scènes parlées sont refaites.
 * Renvoie les identifiants des scènes synthétisées.
 */
export async function generateTakes(
  shortId: string,
  script: ShortScript,
  provider: TtsProvider,
  outputDir: string,
  only?: string[],
): Promise<string[]> {
  const dir = path.join(outputDir, shortId, 'recordings');
  await mkdir(dir, { recursive: true });
  const scenes = spokenScenes(script).filter(
    (s) => !only || only.includes(s.id),
  );
  const done: string[] = [];
  for (const scene of scenes) {
    const result = await provider.synthesize(scene.voiceover.trim());
    await writeFile(path.join(dir, `scene-${scene.id}.mp3`), result.audio);
    const take: TakeWords = {
      provider: provider.name,
      voiceId: provider.voiceId,
      modelId: provider.modelId,
      words: result.words,
    };
    await writeFile(takeWordsFile(dir, scene.id), JSON.stringify(take));
    logger.info(
      `  scène ${scene.id} : ${result.durationSec.toFixed(1)} s synthétisées (${provider.name})`,
    );
    done.push(scene.id);
  }
  return done;
}

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
  // Origine des prises : synthèse si toutes ont un .words.json du même
  // fournisseur, enregistrement sinon.
  const takeSources: (TakeWords | null)[] = [];
  for (const scene of scenes) {
    const src = path.join(dir, findRecording(files, scene.id)!);
    const file = path.join(shortId, `scene-${scene.id}.wav`);
    const takeWords = await readTakeWords(dir, scene.id);
    takeSources.push(takeWords);
    const processed: ProcessedRecording = await process_(
      src,
      path.join(options.outputDir, file),
      scene.voiceover,
      takeWords?.words,
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
  const synthesized =
    takeSources.length > 0 && takeSources.every((t) => t !== null)
      ? takeSources[0]
      : null;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    provider: synthesized?.provider ?? 'recorded',
    voiceId: synthesized?.voiceId ?? '',
    modelId: synthesized?.modelId ?? '',
    outputDir: path.resolve(options.outputDir),
    scenes: result,
  };
}

export interface SheetTarget {
  id: string;
  script: StoredScript;
}

/**
 * Shorts à lire : script prêt (draft), pas encore de voix (ou tous les draft
 * avec `includeVoiced`), ou un short précis.
 */
export async function loadReadingTargets(
  db: NeonHttpDatabase,
  shortId?: string,
  includeVoiced = false,
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
          includeVoiced
            ? and(
                eq(videoShorts.status, 'draft'),
                isNotNull(videoShorts.script),
              )
            : and(
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
