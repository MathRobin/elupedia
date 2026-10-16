import { stat } from 'node:fs/promises';
import path from 'node:path';
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { asc, eq } from 'drizzle-orm';
import { videoShorts } from '@elupedia/shared';
import { logger } from './logger.js';
import type { StoredScript } from './generate-script.js';
import { buildDescription } from './description.js';
import { factsDrift, formatDrift } from './facts-drift.js';
import { loadShortFacts } from './script-facts.js';
import type {
  PrivacyStatus,
  VideoMetadata,
  YoutubeUploader,
} from './youtube.js';

/**
 * Publication YouTube des shorts `approved`. Un short par exécution par
 * défaut : le DAG tourne tous les jours, ce qui espace naturellement les
 * publications. L'identifiant YouTube est enregistré avant la vignette,
 * pour ne jamais republier une vidéo déjà en ligne si la suite échoue.
 */

export interface PublishOptions {
  shortId?: string;
  outputDir: string;
  privacyStatus: PrivacyStatus;
  max: number;
  dryRun: boolean;
}

export function buildMetadata(
  stored: Pick<StoredScript, 'script' | 'facts'>,
  privacyStatus: PrivacyStatus,
): VideoMetadata {
  return {
    title: stored.script.title,
    description: buildDescription(stored.facts, stored.script),
    tags: stored.script.hashtags,
    privacyStatus,
  };
}

export async function publishShorts(
  db: NeonHttpDatabase,
  uploader: YoutubeUploader,
  options: PublishOptions,
): Promise<{ published: string[]; failed: string[] }> {
  const published: string[] = [];
  const failed: string[] = [];

  const columns = {
    id: videoShorts.id,
    status: videoShorts.status,
    script: videoShorts.script,
    videoKey: videoShorts.videoKey,
    thumbnailKey: videoShorts.thumbnailKey,
    youtubeVideoId: videoShorts.youtubeVideoId,
  };
  const targets = options.shortId
    ? await db
        .select(columns)
        .from(videoShorts)
        .where(eq(videoShorts.id, options.shortId))
    : await db
        .select(columns)
        .from(videoShorts)
        .where(eq(videoShorts.status, 'approved'))
        .orderBy(asc(videoShorts.updatedAt))
        .limit(options.max);

  if (options.shortId && targets.length === 0) {
    throw new Error(`video_short ${options.shortId} introuvable`);
  }
  logger.info(`${targets.length} short(s) à publier`);

  for (const target of targets) {
    const stored = target.script as StoredScript | null;
    if (target.status !== 'approved') {
      logger.error(
        `short ${target.id} : statut ${target.status}, seul un short approuvé se publie`,
      );
      failed.push(target.id);
      continue;
    }
    if (target.youtubeVideoId) {
      logger.error(
        `short ${target.id} : déjà en ligne (${target.youtubeVideoId}), rien à faire`,
      );
      failed.push(target.id);
      continue;
    }
    if (!stored?.script || !target.videoKey) {
      logger.error(`short ${target.id} : script ou vidéo manquants`);
      failed.push(target.id);
      continue;
    }
    const videoPath = path.join(options.outputDir, target.videoKey);
    try {
      await stat(videoPath);
    } catch {
      logger.error(`short ${target.id} : fichier absent ${videoPath}`);
      failed.push(target.id);
      continue;
    }
    // Les chiffres de la vidéo doivent encore correspondre à la source
    // officielle au moment de publier (mises au point de l'AN après coup).
    const drift = factsDrift(stored.facts, await loadShortFacts(db, target.id));
    if (drift.length > 0) {
      logger.error(
        `short ${target.id} : les faits ont changé depuis le script, publication refusée — ${formatDrift(drift)}. Regénérer (make ${target.id} --rescript) ou réviser à la main.`,
      );
      failed.push(target.id);
      continue;
    }
    const meta = buildMetadata(stored, options.privacyStatus);
    if (options.dryRun) {
      logger.info(
        `[dry-run] short ${target.id} : « ${meta.title} » (${meta.privacyStatus}) depuis ${videoPath}`,
      );
      published.push(target.id);
      continue;
    }
    try {
      const videoId = await uploader.uploadVideo(videoPath, meta);
      await db
        .update(videoShorts)
        .set({
          youtubeVideoId: videoId,
          status: 'published',
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(videoShorts.id, target.id));
      logger.info(
        `short ${target.id} : publié https://youtube.com/shorts/${videoId} (${meta.privacyStatus})`,
      );
      if (target.thumbnailKey) {
        const ok = await uploader.setThumbnail(
          videoId,
          path.join(options.outputDir, target.thumbnailKey),
        );
        if (!ok) {
          logger.warn(
            `short ${target.id} : vignette refusée par YouTube (compte non vérifié ?), vidéo publiée quand même`,
          );
        }
      }
      published.push(target.id);
    } catch (error) {
      logger.error(`short ${target.id} : publication échouée — ${error}`);
      failed.push(target.id);
    }
  }

  return { published, failed };
}
