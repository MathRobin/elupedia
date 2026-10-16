'use server';

/**
 * Actions d'un short depuis sa page de détail : revue (approuver, rejeter),
 * publication YouTube avec contrôle de dérive des faits, et lancement des
 * commandes longues (make, script, voix, rendu) en tâches détachées
 * (lib/shorts-jobs.ts). La revue est ouverte aux modérateurs ; publier et
 * regénérer un script (dépense) sont réservés aux admins.
 */
import { eq } from 'drizzle-orm';
import { createDb, videoShorts } from '@elupedia/shared';
import { reviewShort } from '@elupedia/shorts/src/review.js';
import { publishShorts } from '@elupedia/shorts/src/publish.js';
import {
  createYoutubeUploader,
  refreshAccessToken,
  type PrivacyStatus,
} from '@elupedia/shorts/src/youtube.js';
import { factsDrift, formatDrift } from '@elupedia/shorts/src/facts-drift.js';
import { loadShortFacts } from '@elupedia/shorts/src/script-facts.js';
import type { StoredScript } from '@elupedia/shorts/src/generate-script.js';
import { auth } from '@/lib/auth';
import {
  SHORT_JOBS,
  readShortJob,
  readShortJobLog,
  startShortJob,
  type ShortJobKind,
  type ShortJobState,
} from '@/lib/shorts-jobs';
import { shortsOutputDir } from '@/lib/shorts-files';

const db = createDb();

async function requireRole(roles: string[]): Promise<void> {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!role || !roles.includes(role)) throw new Error('Forbidden');
}

export async function approveShort(id: string, note?: string): Promise<void> {
  await requireRole(['admin', 'moderator']);
  await reviewShort(db, { shortId: id, decision: 'approved', note });
}

export async function rejectShort(id: string, note: string): Promise<void> {
  await requireRole(['admin', 'moderator']);
  if (!note.trim()) throw new Error('Un motif est requis pour rejeter');
  await reviewShort(db, { shortId: id, decision: 'rejected', note });
}

export interface PublishPreview {
  configured: boolean;
  privacy: PrivacyStatus;
  title: string | null;
  /** Dérive entre les faits figés avec le script et la base ; vide = publiable. */
  drift: string | null;
  blockers: string[];
}

export async function publishPreview(id: string): Promise<PublishPreview> {
  await requireRole(['admin', 'moderator']);
  const [row] = await db
    .select({
      status: videoShorts.status,
      script: videoShorts.script,
      videoKey: videoShorts.videoKey,
      youtubeVideoId: videoShorts.youtubeVideoId,
    })
    .from(videoShorts)
    .where(eq(videoShorts.id, id))
    .limit(1);
  if (!row) throw new Error('Short introuvable');
  const stored = row.script as StoredScript | null;
  const blockers: string[] = [];
  if (row.status !== 'approved')
    blockers.push(`statut ${row.status} : seul un short approuvé se publie`);
  if (!stored?.script) blockers.push('pas de script');
  if (!row.videoKey) blockers.push('pas de vidéo rendue');
  if (row.youtubeVideoId)
    blockers.push(`déjà en ligne (${row.youtubeVideoId})`);
  let drift: string | null = null;
  if (stored?.script) {
    const d = factsDrift(stored.facts, await loadShortFacts(db, id));
    if (d.length > 0) {
      drift = formatDrift(d);
      blockers.push('les faits ont changé depuis le script');
    }
  }
  const configured = Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN,
  );
  if (!configured)
    blockers.push(
      'YOUTUBE_CLIENT_ID / SECRET / REFRESH_TOKEN manquants dans .env',
    );
  return {
    configured,
    privacy:
      (process.env.YOUTUBE_PRIVACY_STATUS as PrivacyStatus | undefined) ??
      'public',
    title: stored?.script.title ?? null,
    drift,
    blockers,
  };
}

export async function publishShort(
  id: string,
  privacy: PrivacyStatus,
): Promise<{ ok: boolean; message: string }> {
  await requireRole(['admin']);
  const preview = await publishPreview(id);
  if (preview.blockers.length > 0) {
    return { ok: false, message: preview.blockers.join(' ; ') };
  }
  const accessToken = await refreshAccessToken(
    {
      clientId: process.env.YOUTUBE_CLIENT_ID!,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET!,
    },
    process.env.YOUTUBE_REFRESH_TOKEN!,
  );
  const result = await publishShorts(db, createYoutubeUploader(accessToken), {
    shortId: id,
    outputDir: shortsOutputDir(),
    privacyStatus: privacy,
    max: 1,
    dryRun: false,
  });
  return result.published.includes(id)
    ? { ok: true, message: 'Publié sur YouTube' }
    : {
        ok: false,
        message: 'Publication refusée, voir les notes du short et les journaux',
      };
}

export interface JobView {
  state: ShortJobState | null;
  label: string | null;
  log: string;
}

export async function getShortJob(id: string): Promise<JobView> {
  await requireRole(['admin', 'moderator']);
  const state = await readShortJob(id);
  return {
    state,
    label: state ? SHORT_JOBS[state.kind].label : null,
    log: await readShortJobLog(id),
  };
}

export async function launchShortJob(
  id: string,
  kind: ShortJobKind,
): Promise<JobView> {
  await requireRole(kind === 'rescript' ? ['admin'] : ['admin', 'moderator']);
  await startShortJob(id, kind);
  return getShortJob(id);
}

/** Prix publics claude-opus-5-5 : 4 $ / M tokens en entrée, 20 $ / M en sortie. */
export async function rescriptCostEstimate(id: string): Promise<string | null> {
  await requireRole(['admin', 'moderator']);
  const [row] = await db
    .select({ script: videoShorts.script })
    .from(videoShorts)
    .where(eq(videoShorts.id, id))
    .limit(1);
  const stored = row?.script as StoredScript | null;
  if (!stored?.usage) return null;
  const dollars =
    (stored.usage.inputTokens / 1_000_000) * 4 +
    (stored.usage.outputTokens / 1_000_000) * 20;
  return `≈ ${(dollars * 100).toFixed(1)} ¢ (d'après le script précédent : ${stored.usage.inputTokens} tokens en entrée, ${stored.usage.outputTokens} en sortie, ${stored.attempts} tentative(s))`;
}
