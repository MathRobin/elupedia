import { mkdir, readdir, copyFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { videoShorts } from '@elupedia/shared';
import { bundle, type WebpackOverrideFn } from '@remotion/bundler';
import {
  ensureBrowser,
  renderMedia,
  renderStill,
  selectComposition,
} from '@remotion/renderer';
import { logger } from './logger.js';
import type { StoredScript } from './generate-script.js';
import type { ShortFacts } from './script-facts.js';
import { buildDescription } from './description.js';
import type { StoredVoiceover } from './voiceover.js';
import type { ShortProps } from './remotion/props.js';
import { FPS } from './remotion/props.js';
import { buildTimeline, estimateWordTimings } from './remotion/timeline.js';
import type { ShortScript } from './script-schema.js';

/**
 * Rendu vidéo d'un short avec Remotion : bundle de la composition (une fois
 * par exécution), puis pour chaque short une vidéo 1080×1920 H.264 + une
 * vignette PNG dans `<outputDir>/<shortId>/`. Le dossier du short sert de
 * dossier « public » du bundle : la composition y lit les MP3 de la voix off
 * (`staticFile`) et les éventuelles images de b-roll (`broll/`).
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Le code est écrit avec des imports `./x.js` (convention Node16 de TypeScript)
 * que webpack ne sait pas résoudre vers `x.ts(x)` sans cet alias.
 */
export const webpackOverride: WebpackOverrideFn = (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
  },
});
export const ENTRY_POINT = path.join(here, 'remotion', 'index.ts');
/** Fichiers statiques de la composition (logo), copiés dans le dossier du short. */
export const PUBLIC_DIR = path.join(here, '..', 'public');
export const COMPOSITION_ID = 'Short';
export const VIDEO_FILE = 'short.mp4';
export const THUMBNAIL_FILE = 'thumbnail.png';
export const DESCRIPTION_FILE = 'description.txt';

export interface RenderOptions {
  shortId?: string;
  force: boolean;
  dryRun: boolean;
  outputDir: string;
  /** Rendu accéléré pour vérifier la composition (basse qualité). */
  draft: boolean;
  /** Inclut aussi les shorts sans voix (rendu muet, sous-titres estimés). */
  silent?: boolean;
}

/**
 * Télécharge dans le dossier du short la photo des auteurs de textes, pour
 * que le rendu ne dépende pas du réseau. Une photo introuvable est ignorée :
 * la scène s'affiche alors sans portrait.
 */
export async function fetchProposerPhotos(
  facts: ShortFacts,
  shortDir: string,
  fetchFn: typeof fetch = fetch,
): Promise<Record<string, string>> {
  const photos: Record<string, string> = {};
  const dir = path.join(shortDir, 'photos');
  for (const ballot of facts.ballots) {
    for (const p of ballot.proposers) {
      if (!p.photoUrl || photos[p.officialId]) continue;
      const rel = `photos/${p.officialId}.jpg`;
      const file = path.join(shortDir, rel);
      try {
        await stat(file);
        photos[p.officialId] = rel;
        continue;
      } catch {
        // à télécharger
      }
      try {
        const res = await fetchFn(p.photoUrl, {
          headers: { 'User-Agent': 'Elupedia/1.0 (shorts)' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await mkdir(dir, { recursive: true });
        await writeFile(file, Buffer.from(await res.arrayBuffer()));
        photos[p.officialId] = rel;
      } catch (error) {
        logger.warn(`photo de ${p.name} indisponible (${error}), ignorée`);
      }
    }
  }
  return photos;
}

export async function listBroll(dir: string): Promise<string[]> {
  try {
    const files = await readdir(path.join(dir, 'broll'));
    return files
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort()
      .map((f) => `broll/${f}`);
  } catch {
    return [];
  }
}

/**
 * Sans voix off (démo, voix pas encore importée) : sous-titres à horodatage estimé
 * et vidéo muette, plutôt qu'une vidéo sans texte.
 */
export function estimatedVoiceover(script: ShortScript): StoredVoiceover {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    provider: 'estimated',
    voiceId: '',
    modelId: '',
    outputDir: '',
    scenes: script.scenes
      .filter((s) => s.voiceover.trim())
      .map((s) => {
        const words = estimateWordTimings(s.voiceover);
        return {
          sceneId: s.id,
          file: '',
          durationSec: words.length > 0 ? words[words.length - 1].end : 0,
          words,
        };
      }),
  };
}

/** Les MP3 de la voix off peuvent venir d'un autre dossier de sortie. */
async function syncVoiceoverFiles(
  voiceover: StoredVoiceover,
  shortDir: string,
): Promise<void> {
  for (const scene of voiceover.scenes) {
    if (!scene.file) continue;
    const target = path.join(shortDir, path.basename(scene.file));
    const source = path.join(voiceover.outputDir, scene.file);
    if (path.resolve(source) === path.resolve(target)) continue;
    try {
      await stat(target);
    } catch {
      await copyFile(source, target);
    }
  }
}

export async function renderShort(
  shortId: string,
  props: ShortProps,
  options: Pick<RenderOptions, 'outputDir' | 'draft'>,
  onProgress?: (fraction: number) => void,
): Promise<{ videoFile: string; thumbnailFile: string; durationSec: number }> {
  const shortDir = path.join(options.outputDir, shortId);
  await mkdir(shortDir, { recursive: true });
  if (props.voiceover) await syncVoiceoverFiles(props.voiceover, shortDir);
  for (const file of await readdir(PUBLIC_DIR)) {
    await copyFile(path.join(PUBLIC_DIR, file), path.join(shortDir, file));
  }

  const serveUrl = await bundle({
    entryPoint: ENTRY_POINT,
    publicDir: shortDir,
    webpackOverride,
    onProgress: () => {},
  });

  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps,
  });

  const videoFile = path.join(shortId, VIDEO_FILE);
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    audioCodec: 'aac',
    outputLocation: path.join(options.outputDir, videoFile),
    inputProps,
    scale: options.draft ? 0.5 : 1,
    crf: options.draft ? 32 : 18,
    onProgress: ({ progress }) => onProgress?.(progress),
  });

  // Vignette : au premier tiers de la première scène, quand l'animation
  // d'entrée est terminée.
  const timeline = buildTimeline(props.script, props.voiceover, FPS);
  const first = timeline.scenes[0];
  const thumbnailFile = path.join(shortId, THUMBNAIL_FILE);
  await renderStill({
    composition,
    serveUrl,
    output: path.join(options.outputDir, thumbnailFile),
    inputProps,
    frame: first ? first.from + Math.floor(first.durationInFrames / 3) : 0,
  });

  return {
    videoFile,
    thumbnailFile,
    durationSec: Math.round((timeline.totalFrames / FPS) * 10) / 10,
  };
}

export async function renderShorts(
  db: NeonHttpDatabase,
  options: RenderOptions,
): Promise<{ rendered: string[]; failed: string[] }> {
  const rendered: string[] = [];
  const failed: string[] = [];

  const columns = {
    id: videoShorts.id,
    script: videoShorts.script,
    voiceover: videoShorts.voiceover,
    videoKey: videoShorts.videoKey,
  };
  const targets = options.shortId
    ? await db
        .select(columns)
        .from(videoShorts)
        .where(eq(videoShorts.id, options.shortId))
    : await db
        .select(columns)
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
                isNull(videoShorts.videoKey),
                // Sans option, seuls les shorts dont la voix est importée :
                // la voix est enregistrée à la main, inutile de rendre muet.
                options.silent ? undefined : isNotNull(videoShorts.voiceover),
              ),
        );

  if (options.shortId && targets.length === 0) {
    throw new Error(`video_short ${options.shortId} introuvable`);
  }
  logger.info(`${targets.length} short(s) à rendre`);
  if (targets.length > 0 && !options.dryRun) await ensureBrowser();

  for (const target of targets) {
    const stored = target.script as StoredScript | null;
    if (!stored?.script) {
      logger.warn(`short ${target.id} : pas de script, ignoré`);
      failed.push(target.id);
      continue;
    }
    let voiceover = target.voiceover as StoredVoiceover | null;
    if (!voiceover) {
      logger.warn(
        `short ${target.id} : pas de voix off, rendu muet avec sous-titres estimés`,
      );
      voiceover = estimatedVoiceover(stored.script);
    }
    const shortDir = path.join(options.outputDir, target.id);
    const props: ShortProps = {
      facts: stored.facts,
      script: stored.script,
      voiceover,
      broll: await listBroll(shortDir),
      photos: options.dryRun
        ? {}
        : await fetchProposerPhotos(stored.facts, shortDir),
    };
    const timeline = buildTimeline(props.script, props.voiceover, FPS);
    if (options.dryRun) {
      logger.info(
        `[dry-run] short ${target.id} : ${timeline.scenes.length} scènes, ${(timeline.totalFrames / FPS).toFixed(1)} s, ${props.broll.length} image(s) de b-roll`,
      );
      rendered.push(target.id);
      continue;
    }
    try {
      let lastLogged = -1;
      const result = await renderShort(target.id, props, options, (p) => {
        const pct = Math.floor(p * 10) * 10;
        if (pct > lastLogged) {
          lastLogged = pct;
          logger.info(`  rendu ${pct} %`);
        }
      });
      await db
        .update(videoShorts)
        .set({
          videoKey: result.videoFile,
          thumbnailKey: result.thumbnailFile,
          updatedAt: new Date(),
        })
        .where(eq(videoShorts.id, target.id));
      // Texte d'accompagnement, relu avec la vidéo puis repris tel quel à la
      // publication (liens Elupedia + sources officielles).
      const descriptionFile = path.join(shortDir, DESCRIPTION_FILE);
      await writeFile(
        descriptionFile,
        buildDescription(stored.facts, stored.script),
      );
      logger.info(
        `short ${target.id} : ${result.durationSec} s rendues dans ${path.join(options.outputDir, result.videoFile)}, description dans ${descriptionFile}`,
      );
      rendered.push(target.id);
    } catch (error) {
      logger.error(`short ${target.id} : rendu échoué — ${error}`);
      failed.push(target.id);
    }
  }

  return { rendered, failed };
}
