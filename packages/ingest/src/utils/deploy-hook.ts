/**
 * Rebuild du site après une ingestion : les pages statiques (accueil,
 * annuaire, votes…) sont figées au build Vercel, et sans ce déclencheur elles
 * ne se rafraîchissaient qu'au merge suivant. Chaque DAG d'ingestion termine
 * par `yarn --cwd packages/ingest rebuild:site --report <fichier>…` : si l'un
 * des rapports de run cités dit `hasChanges`, on appelle le Deploy Hook Vercel
 * (`VERCEL_DEPLOY_HOOK_URL`, un POST sans corps suffit).
 *
 * Garde-fous : plusieurs DAGs peuvent finir à quelques minutes d'écart, et un
 * build Vercel dure plusieurs minutes ; un fichier d'état mémorise le dernier
 * déclenchement et on n'en refait pas un avant MIN_INTERVAL_MINUTES. Un hook
 * absent, un rapport illisible ou un échec réseau sont logués, jamais levés :
 * l'ingestion a réussi, ce n'est pas à elle d'échouer pour un rebuild.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { logger } from '../logger.js';
import type { ChangeReport } from './change-detector.js';

/** Délai minimal entre deux déclenchements (un build Vercel dure ~5 min). */
export const MIN_INTERVAL_MINUTES = 20;

/** Fichier d'état, relatif au cwd du script (packages/ingest), ignoré par git. */
export const STATE_FILE = '.rebuild-site-state.json';

interface RebuildState {
  lastTriggeredAt: string;
}

export type RebuildOutcome =
  'triggered' | 'no_changes' | 'throttled' | 'no_hook' | 'failed';

/** Lit un rapport de run ; null s'il manque ou n'est pas du JSON. */
export function readChangeReport(path: string): ChangeReport | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ChangeReport;
  } catch {
    return null;
  }
}

/**
 * Décide s'il faut déclencher : au moins un rapport avec des changements, et
 * pas de déclenchement depuis moins de `minIntervalMinutes`. Fonction pure.
 */
export function shouldTriggerRebuild(
  reports: (ChangeReport | null)[],
  lastTriggeredAt: Date | null,
  now: Date,
  minIntervalMinutes = MIN_INTERVAL_MINUTES,
): 'triggered' | 'no_changes' | 'throttled' {
  if (!reports.some((report) => report?.hasChanges)) return 'no_changes';
  if (
    lastTriggeredAt &&
    now.getTime() - lastTriggeredAt.getTime() < minIntervalMinutes * 60_000
  ) {
    return 'throttled';
  }
  return 'triggered';
}

function readState(stateFile: string): Date | null {
  if (!existsSync(stateFile)) return null;
  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as RebuildState;
    const date = new Date(state.lastTriggeredAt);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Point d'entrée : lit les rapports, décide, appelle le hook, mémorise la
 * date. Retourne l'issue pour le log et les tests.
 */
export async function triggerSiteRebuild(options: {
  reportFiles: string[];
  hookUrl: string | undefined;
  fetchFn?: typeof fetch;
  stateFile?: string;
  now?: Date;
}): Promise<RebuildOutcome> {
  const {
    reportFiles,
    hookUrl,
    fetchFn = fetch,
    stateFile = STATE_FILE,
    now = new Date(),
  } = options;

  const reports = reportFiles.map((file) => {
    const report = readChangeReport(file);
    if (!report) logger.warn(`  Rapport illisible ou absent : ${file}`);
    return report;
  });
  const decision = shouldTriggerRebuild(reports, readState(stateFile), now);
  if (decision === 'no_changes') {
    logger.info(
      'Rebuild du site : aucun changement dans les rapports, rien à faire',
    );
    return decision;
  }
  if (decision === 'throttled') {
    logger.info(
      `Rebuild du site : un déclenchement date de moins de ${MIN_INTERVAL_MINUTES} min, on laisse le build en cours`,
    );
    return decision;
  }
  if (!hookUrl) {
    logger.warn(
      'Rebuild du site : VERCEL_DEPLOY_HOOK_URL absente, pas de déclenchement (voir .env.example)',
    );
    return 'no_hook';
  }

  try {
    const response = await fetchFn(hookUrl, { method: 'POST' });
    if (!response.ok) {
      logger.error(
        `Rebuild du site : le hook Vercel répond ${response.status}`,
      );
      return 'failed';
    }
  } catch (error) {
    logger.error(
      `Rebuild du site : appel du hook Vercel impossible (${error})`,
    );
    return 'failed';
  }
  writeFileSync(
    stateFile,
    JSON.stringify({
      lastTriggeredAt: now.toISOString(),
    } satisfies RebuildState),
  );
  logger.info('Rebuild du site : déclenché sur Vercel');
  return 'triggered';
}
