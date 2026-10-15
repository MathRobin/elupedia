import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { desc, eq, inArray } from 'drizzle-orm';
import { videoShorts, videoShortBallots, ballots } from '@elupedia/shared';
import type { StoredScript } from './generate-script.js';
import type { StoredVoiceover } from './voiceover.js';

/**
 * Revue humaine : seul gate manuel du pipeline. Un short passe de `draft`
 * (script, voix off et vidéo générés) à `approved` (publiable) ou `rejected`.
 * Pour corriger un short : regénérer le script (`script --id --force`), puis
 * `voiceover --id --force` et `render --id --force`, et relire.
 */

export interface ReviewRow {
  id: string;
  status: string;
  score: number;
  createdAt: Date;
  updatedAt: Date;
  title: string | null;
  sceneCount: number;
  voiceoverSec: number | null;
  videoKey: string | null;
  thumbnailKey: string | null;
  youtubeVideoId: string | null;
  notes: string | null;
  ballotTitles: string[];
}

export async function listShorts(
  db: NeonHttpDatabase,
  statuses: string[],
): Promise<ReviewRow[]> {
  const rows = await db
    .select({
      id: videoShorts.id,
      status: videoShorts.status,
      score: videoShorts.score,
      createdAt: videoShorts.createdAt,
      updatedAt: videoShorts.updatedAt,
      script: videoShorts.script,
      voiceover: videoShorts.voiceover,
      videoKey: videoShorts.videoKey,
      thumbnailKey: videoShorts.thumbnailKey,
      youtubeVideoId: videoShorts.youtubeVideoId,
      notes: videoShorts.notes,
    })
    .from(videoShorts)
    .where(inArray(videoShorts.status, statuses))
    .orderBy(desc(videoShorts.createdAt));
  if (rows.length === 0) return [];

  const links = await db
    .select({
      shortId: videoShortBallots.videoShortId,
      title: ballots.title,
      position: videoShortBallots.position,
    })
    .from(videoShortBallots)
    .innerJoin(ballots, eq(ballots.id, videoShortBallots.ballotId))
    .where(
      inArray(
        videoShortBallots.videoShortId,
        rows.map((r) => r.id),
      ),
    );

  return rows.map((r) => {
    const stored = r.script as StoredScript | null;
    const voiceover = r.voiceover as StoredVoiceover | null;
    return {
      id: r.id,
      status: r.status,
      score: r.score,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      title: stored?.script.title ?? null,
      sceneCount: stored?.script.scenes.length ?? 0,
      voiceoverSec: voiceover
        ? Math.round(
            voiceover.scenes.reduce((s, sc) => s + sc.durationSec, 0) * 10,
          ) / 10
        : null,
      videoKey: r.videoKey,
      thumbnailKey: r.thumbnailKey,
      youtubeVideoId: r.youtubeVideoId,
      notes: r.notes,
      ballotTitles: links
        .filter((l) => l.shortId === r.id)
        .sort((a, b) => a.position - b.position)
        .map((l) => l.title),
    };
  });
}

export function formatReviewRow(row: ReviewRow, outputDir: string): string {
  const lines = [
    `${row.id}  [${row.status}]  score ${row.score}  créé le ${row.createdAt.toISOString().slice(0, 10)}`,
    `  titre     : ${row.title ?? '(pas de script)'}`,
    ...row.ballotTitles.map((t) => `  scrutin   : ${t}`),
    `  scènes    : ${row.sceneCount}${row.voiceoverSec !== null ? ` · voix off ${row.voiceoverSec} s` : ' · pas de voix off'}`,
    `  vidéo     : ${row.videoKey ? `${outputDir}/${row.videoKey}` : '(pas rendue)'}`,
  ];
  if (row.youtubeVideoId) {
    lines.push(
      `  youtube   : https://youtube.com/shorts/${row.youtubeVideoId}`,
    );
  }
  if (row.notes)
    lines.push(
      `  notes     : ${row.notes.split('\n').join('\n              ')}`,
    );
  return lines.join('\n');
}

export interface ReviewDecision {
  shortId: string;
  decision: 'approved' | 'rejected';
  note?: string;
}

export async function reviewShort(
  db: NeonHttpDatabase,
  d: ReviewDecision,
): Promise<void> {
  const [row] = await db
    .select({
      status: videoShorts.status,
      videoKey: videoShorts.videoKey,
      script: videoShorts.script,
    })
    .from(videoShorts)
    .where(eq(videoShorts.id, d.shortId))
    .limit(1);
  if (!row) throw new Error(`video_short ${d.shortId} introuvable`);
  if (row.status === 'published') {
    throw new Error(`video_short ${d.shortId} est déjà publié`);
  }
  if (d.decision === 'approved' && (!row.videoKey || !row.script)) {
    throw new Error(
      `video_short ${d.shortId} n'a pas de vidéo rendue : impossible d'approuver`,
    );
  }
  await db
    .update(videoShorts)
    .set({
      status: d.decision,
      notes: d.note
        ? `[revue ${new Date().toISOString().slice(0, 10)}] ${d.note}`
        : null,
      updatedAt: new Date(),
    })
    .where(eq(videoShorts.id, d.shortId));
}
