import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { videoShorts } from '@elupedia/shared';
import type { StoredScript } from './generate-script.js';
import { findRecording, spokenScenes } from './voiceover.js';
import type { ShortScript } from './script-schema.js';
import type { StoredVoiceover } from './voiceover.js';

/**
 * Commande unique pour un short : script → voix → rendu, en sautant ce qui est
 * déjà à jour. La revue (`review approve`) et la publication restent des
 * étapes à part : c'est le gate humain.
 */

export interface MakeState {
  hasScript: boolean;
  /** Date d'import de la voix, null si aucune voix importée. */
  voiceImportedAt: number | null;
  /** Prises manquantes (ids de scène) ; vide = toutes présentes. */
  missingTakes: string[];
  /** Date de modification de la prise la plus récente, null si aucune. */
  latestTakeAt: number | null;
  hasVideo: boolean;
}

export interface MakeFlags {
  rescript: boolean;
  reimport: boolean;
  force: boolean;
  /** Continue sans voix (muet, sous-titres estimés) si les prises manquent. */
  silent: boolean;
}

export interface MakePlan {
  script: boolean;
  importVoice: boolean;
  /** Prises manquantes et pas de voix en base : fiche de lecture, puis arrêt. */
  needTakes: boolean;
  render: boolean;
  reasons: string[];
}

/** Décide des étapes à exécuter. Pure : tout ce qu'elle lit est dans `state`. */
export function planMake(state: MakeState, flags: MakeFlags): MakePlan {
  const reasons: string[] = [];
  const script = !state.hasScript || flags.rescript;
  if (script) {
    reasons.push(
      state.hasScript ? 'script regénéré (--rescript)' : 'pas de script',
    );
  }
  // Un nouveau script invalide la voix : les textes ont changé.
  const voiceValid = state.voiceImportedAt !== null && !script;
  const takesComplete = state.missingTakes.length === 0;
  const takesNewer =
    state.latestTakeAt !== null &&
    state.voiceImportedAt !== null &&
    state.latestTakeAt > state.voiceImportedAt;

  let importVoice = false;
  if (takesComplete) {
    if (!voiceValid) {
      importVoice = true;
      reasons.push('prises à importer');
    } else if (flags.reimport || takesNewer) {
      importVoice = true;
      reasons.push(
        flags.reimport
          ? 'réimport demandé (--reimport)'
          : 'prises plus récentes que l’import',
      );
    }
  }
  const needTakes = !takesComplete && !voiceValid && !flags.silent;
  const voiceChanged = script || importVoice;
  const render = !needTakes && (flags.force || !state.hasVideo || voiceChanged);
  if (render && !voiceChanged && !flags.force && !state.hasVideo) {
    reasons.push('pas encore de vidéo');
  }
  if (render && flags.force) reasons.push('rendu forcé (--force)');
  return { script, importVoice, needTakes, render, reasons };
}

export async function inspectRecordings(
  dir: string,
  script: ShortScript,
): Promise<{ missing: string[]; latestMtime: number | null }> {
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    // dossier absent : toutes les prises manquent
  }
  const missing: string[] = [];
  let latest: number | null = null;
  for (const scene of spokenScenes(script)) {
    const file = findRecording(files, scene.id);
    if (!file) {
      missing.push(scene.id);
      continue;
    }
    const { mtimeMs } = await stat(path.join(dir, file));
    latest = latest === null ? mtimeMs : Math.max(latest, mtimeMs);
  }
  return { missing, latestMtime: latest };
}

export async function loadMakeRow(db: NeonHttpDatabase, shortId: string) {
  const [row] = await db
    .select({
      id: videoShorts.id,
      status: videoShorts.status,
      script: videoShorts.script,
      voiceover: videoShorts.voiceover,
      videoKey: videoShorts.videoKey,
    })
    .from(videoShorts)
    .where(eq(videoShorts.id, shortId))
    .limit(1);
  if (!row) throw new Error(`video_short ${shortId} introuvable`);
  if (row.status === 'published') {
    throw new Error(`video_short ${shortId} est déjà publié`);
  }
  return {
    ...row,
    script: row.script as StoredScript | null,
    voiceover: row.voiceover as StoredVoiceover | null,
  };
}

export function describePlan(plan: MakePlan): string {
  const steps = [
    plan.script ? 'script' : null,
    plan.importVoice ? 'import de la voix' : null,
    plan.render ? 'rendu' : null,
  ].filter(Boolean);
  if (plan.needTakes) {
    const before = steps.length > 0 ? `${steps.join(' → ')}, puis ` : '';
    return `${before}arrêt : prises de voix manquantes (fiche de lecture à générer)`;
  }
  return steps.length > 0 ? steps.join(' → ') : 'rien à faire (déjà à jour)';
}
