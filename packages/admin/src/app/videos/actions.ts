'use server';

/**
 * Actions serveur de la section Vidéos (shorts) : liste filtrable par statut
 * et détail d'un short (script, texte d'accompagnement, scrutin lié, fichiers
 * disponibles). Lecture seule : la revue reste `review approve|reject` côté
 * packages/shorts. Accessible aux rôles admin et moderator.
 */
import { desc, eq, inArray } from 'drizzle-orm';
import {
  ballots,
  createDb,
  officialBallotSources,
  videoShortBallots,
  videoShorts,
  type VideoShortStatus,
} from '@elupedia/shared';
import { buildDescription } from '@elupedia/shorts/src/description.js';
import type { StoredScript } from '@elupedia/shorts/src/generate-script.js';
import type { StoredVoiceover } from '@elupedia/shorts/src/voiceover.js';
import { auth } from '@/lib/auth';
import { shortFileExists } from '@/lib/shorts-files';

const db = createDb();
const SITE_URL = 'https://www.elupedia.fr';

async function requireAuthenticatedUser() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!role || (role !== 'admin' && role !== 'moderator')) {
    throw new Error('Forbidden');
  }
}

export type VideoStatusFilter = VideoShortStatus | 'all';

export interface VideoListItem {
  id: string;
  status: string;
  score: number;
  title: string | null;
  hasScript: boolean;
  hasVoiceover: boolean;
  hasVideo: boolean;
  youtubeVideoId: string | null;
  createdAt: string;
  updatedAt: string;
  ballotTitles: string[];
}

export async function listVideos(
  status: VideoStatusFilter,
): Promise<VideoListItem[]> {
  await requireAuthenticatedUser();
  const base = db
    .select({
      id: videoShorts.id,
      status: videoShorts.status,
      score: videoShorts.score,
      script: videoShorts.script,
      voiceover: videoShorts.voiceover,
      videoKey: videoShorts.videoKey,
      youtubeVideoId: videoShorts.youtubeVideoId,
      createdAt: videoShorts.createdAt,
      updatedAt: videoShorts.updatedAt,
    })
    .from(videoShorts)
    .orderBy(desc(videoShorts.createdAt));
  const rows =
    status === 'all'
      ? await base
      : await base.where(eq(videoShorts.status, status));
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

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    score: r.score,
    title: (r.script as StoredScript | null)?.script.title ?? null,
    hasScript: r.script !== null,
    hasVoiceover: r.voiceover !== null,
    hasVideo: r.videoKey !== null,
    youtubeVideoId: r.youtubeVideoId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    ballotTitles: links
      .filter((l) => l.shortId === r.id)
      .sort((a, b) => a.position - b.position)
      .map((l) => l.title),
  }));
}

export interface VideoBallot {
  id: string;
  title: string;
  date: string;
  type: string;
  result: string | null;
  chamber: string;
  elupediaUrl: string;
  sources: { label: string; url: string }[];
}

export interface VideoDetail {
  id: string;
  status: string;
  score: number;
  scoreDetails: unknown;
  notes: string | null;
  youtubeVideoId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  script: StoredScript | null;
  /** Texte d'accompagnement tel qu'il sera publié (null sans script). */
  description: string | null;
  voiceover: {
    provider: string;
    generatedAt: string;
    scenes: { sceneId: string; durationSec: number; words: number }[];
  } | null;
  files: { video: boolean; thumbnail: boolean; description: boolean };
  ballots: VideoBallot[];
}

export async function getVideo(id: string): Promise<VideoDetail | null> {
  await requireAuthenticatedUser();
  const [row] = await db
    .select()
    .from(videoShorts)
    .where(eq(videoShorts.id, id))
    .limit(1);
  if (!row) return null;

  const linked = await db
    .select({
      id: ballots.id,
      title: ballots.title,
      date: ballots.date,
      type: ballots.type,
      result: ballots.result,
      anId: ballots.anId,
      dossierRef: ballots.dossierRef,
      position: videoShortBallots.position,
    })
    .from(videoShortBallots)
    .innerJoin(ballots, eq(ballots.id, videoShortBallots.ballotId))
    .where(eq(videoShortBallots.videoShortId, id));

  const stored = row.script as StoredScript | null;
  const voiceover = row.voiceover as StoredVoiceover | null;

  // Les scripts antérieurs au texte d'accompagnement n'ont pas `sources`
  // dans leurs faits figés : complété depuis les identifiants du scrutin.
  let description: string | null = null;
  if (stored?.script) {
    const facts = {
      ...stored.facts,
      ballots: stored.facts.ballots.map((b) => ({
        ...b,
        sources:
          b.sources ??
          officialBallotSources(
            linked.find((l) => l.id === b.ballotId) ?? { anId: null },
          ),
      })),
    };
    description = buildDescription(facts, stored.script);
  }

  const [video, thumbnail, descriptionFile] = await Promise.all([
    shortFileExists(id, 'short.mp4'),
    shortFileExists(id, 'thumbnail.png'),
    shortFileExists(id, 'description.txt'),
  ]);

  return {
    id: row.id,
    status: row.status,
    score: row.score,
    scoreDetails: row.scoreDetails,
    notes: row.notes,
    youtubeVideoId: row.youtubeVideoId,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    script: stored,
    description,
    voiceover: voiceover
      ? {
          provider: voiceover.provider,
          generatedAt: voiceover.generatedAt,
          scenes: voiceover.scenes.map((s) => ({
            sceneId: s.sceneId,
            durationSec: s.durationSec,
            words: s.words.length,
          })),
        }
      : null,
    files: { video, thumbnail, description: descriptionFile },
    ballots: linked
      .sort((a, b) => a.position - b.position)
      .map((b) => ({
        id: b.id,
        title: b.title,
        date: b.date,
        type: b.type,
        result: b.result,
        chamber: b.anId?.startsWith('senat-') ? 'Sénat' : 'Assemblée nationale',
        elupediaUrl: `${SITE_URL}/scrutins/${b.id}`,
        sources: officialBallotSources(b),
      })),
  };
}
