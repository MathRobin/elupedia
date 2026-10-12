import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { videoShorts } from '@elupedia/shared';
import { logger } from './logger.js';
import type { StoredScript } from './generate-script.js';
import type { ShortScript } from './script-schema.js';
import type { TtsProvider, WordTiming } from './tts.js';

/**
 * Voix off d'un short : un fichier audio par scène (le rendu peut ainsi caler
 * chaque scène sur sa propre piste), horodatage des mots pour les sous-titres,
 * durée réelle (le rendu prend le max entre la durée prévue par le script et
 * la durée de l'audio).
 */

export interface VoiceoverScene {
  sceneId: string;
  /** Chemin du MP3, relatif à `outputDir`. */
  file: string;
  durationSec: number;
  words: WordTiming[];
}

export interface StoredVoiceover {
  version: 1;
  generatedAt: string;
  provider: string;
  voiceId: string;
  modelId: string;
  outputDir: string;
  scenes: VoiceoverScene[];
}

export const DEFAULT_OUTPUT_DIR = 'out';

export async function synthesizeScript(
  shortId: string,
  script: ShortScript,
  provider: TtsProvider,
  outputDir: string,
): Promise<StoredVoiceover> {
  const dir = path.join(outputDir, shortId);
  await mkdir(dir, { recursive: true });

  const scenes: VoiceoverScene[] = [];
  for (const scene of script.scenes) {
    const text = scene.voiceover.trim();
    if (!text) continue;
    const result = await provider.synthesize(text);
    const file = path.join(shortId, `scene-${scene.id}.mp3`);
    await writeFile(path.join(outputDir, file), result.audio);
    scenes.push({
      sceneId: scene.id,
      file,
      durationSec: Math.round(result.durationSec * 100) / 100,
      words: result.words,
    });
    if (result.durationSec > scene.durationSec) {
      logger.warn(
        `scène ${scene.id} : audio de ${result.durationSec.toFixed(1)} s pour ${scene.durationSec} s prévues, le rendu allongera la scène`,
      );
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    provider: provider.name,
    voiceId: provider.voiceId,
    modelId: provider.modelId,
    outputDir: path.resolve(outputDir),
    scenes,
  };
}

export interface VoiceoverOptions {
  shortId?: string;
  force: boolean;
  dryRun: boolean;
  outputDir: string;
}

export async function generateVoiceovers(
  db: NeonHttpDatabase,
  provider: TtsProvider,
  options: VoiceoverOptions,
): Promise<{ generated: string[]; failed: string[] }> {
  const generated: string[] = [];
  const failed: string[] = [];

  const targets = options.shortId
    ? await db
        .select({ id: videoShorts.id, script: videoShorts.script })
        .from(videoShorts)
        .where(eq(videoShorts.id, options.shortId))
    : await db
        .select({ id: videoShorts.id, script: videoShorts.script })
        .from(videoShorts)
        .where(
          options.force
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

  if (options.shortId && targets.length === 0) {
    throw new Error(`video_short ${options.shortId} introuvable`);
  }
  logger.info(`${targets.length} short(s) à sonoriser`);

  for (const target of targets) {
    const stored = target.script as StoredScript | null;
    if (!stored?.script) {
      logger.warn(`short ${target.id} : pas de script, ignoré`);
      failed.push(target.id);
      continue;
    }
    const scenes = stored.script.scenes.filter((s) => s.voiceover.trim());
    if (options.dryRun) {
      const chars = scenes.reduce((n, s) => n + s.voiceover.length, 0);
      logger.info(
        `[dry-run] short ${target.id} : ${scenes.length} scène(s), ${chars} caractères à synthétiser`,
      );
      generated.push(target.id);
      continue;
    }
    try {
      const voiceover = await synthesizeScript(
        target.id,
        stored.script,
        provider,
        options.outputDir,
      );
      await db
        .update(videoShorts)
        .set({ voiceover, updatedAt: new Date() })
        .where(eq(videoShorts.id, target.id));
      const total = voiceover.scenes.reduce((n, s) => n + s.durationSec, 0);
      logger.info(
        `short ${target.id} : ${voiceover.scenes.length} fichier(s), ${total.toFixed(1)} s de voix off dans ${voiceover.outputDir}`,
      );
      generated.push(target.id);
    } catch (error) {
      logger.error(`short ${target.id} : voix off échouée — ${error}`);
      failed.push(target.id);
    }
  }

  return { generated, failed };
}
