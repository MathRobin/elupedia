/**
 * Lecture des runs et des journaux Dagu sur le disque de la machine
 * d'ingestion (service dagu.service, DAGU_HOME, défaut /var/lib/dagu), pour la
 * page /logs de l'admin. L'API HTTP de Dagu exige une authentification non
 * configurée ici : on lit directement les fichiers qu'il écrit.
 *
 * Disposition lue :
 * - data/dag-runs/<dag>/dag-runs/AAAA/MM/JJ/dag-run_<horodatage>_<id>/<tentative>/status.jsonl
 *   (la dernière ligne est l'état courant : statut du run, étapes, chemins des
 *   journaux de chaque étape) ;
 * - logs/<dag>/dag-run_<horodatage>_<id>/ (journal du run + sortie standard /
 *   erreur de chaque étape).
 *
 * Appelants : app/logs/actions.ts. Valable seulement sur la machine
 * d'ingestion (lib/runtime.ts).
 * Pièges : le nom de DAG et l'identifiant de run viennent du navigateur, ils
 * sont validés par regex et le chemin de chaque journal lu est vérifié dans
 * logs/<dag>/<run>/ (jamais un chemin fourni par l'appelant). Les journaux
 * sont lus par la fin (MAX_LOG_BYTES) : un run de plusieurs minutes de yarn
 * peut peser plusieurs Mo.
 */
import { open, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const DAG_NAME = /^[A-Za-z0-9._-]+$/;
export const RUN_ID = /^dag-run_\d{8}_\d{6}Z_[A-Za-z0-9]+$/;
export const MAX_LOG_BYTES = 256 * 1024;

/** Statuts d'un run Dagu (enum core.Status). */
export const RUN_STATUS_LABELS: Record<number, string> = {
  0: 'Non démarré',
  1: 'En cours',
  2: 'Échoué',
  3: 'Annulé',
  4: 'Réussi',
  5: 'En file',
  6: 'Réussi partiellement',
  7: 'En attente',
  8: 'Rejeté',
};

/** Statuts d'une étape (enum core.NodeStatus). */
export const STEP_STATUS_LABELS: Record<number, string> = {
  0: 'Non démarrée',
  1: 'En cours',
  2: 'Échouée',
  3: 'Annulée',
  4: 'Réussie',
  5: 'Ignorée',
  6: 'Réussie partiellement',
  7: 'Réessai',
};

const TRIGGER_LABELS: Record<number, string> = {
  1: 'planifié',
  2: 'manuel',
  3: 'webhook',
  4: 'sous-DAG',
  5: 'relance',
  6: 'rattrapage',
};

export function daguHome(): string {
  return process.env.DAGU_HOME || '/var/lib/dagu';
}

export interface RunSummary {
  runId: string;
  status: number;
  statusLabel: string;
  trigger: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationSec: number | null;
}

export interface StepInfo {
  name: string;
  status: number;
  statusLabel: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  hasStdout: boolean;
  hasStderr: boolean;
}

export interface RunDetail extends RunSummary {
  steps: StepInfo[];
  hasRunLog: boolean;
}

export type LogTarget =
  { kind: 'run' } | { kind: 'step'; step: string; stream: 'out' | 'err' };

export interface LogContent {
  content: string;
  /** true si le début du fichier a été coupé (MAX_LOG_BYTES). */
  truncated: boolean;
  /** Taille du fichier en octets. */
  size: number;
}

interface StatusNode {
  step?: { name?: string };
  stdout?: string;
  stderr?: string;
  status?: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

interface StatusLine {
  status?: number;
  triggerType?: number;
  queuedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  log?: string;
  nodes?: StatusNode[];
}

function runsRoot(dag: string): string {
  return path.join(daguHome(), 'data', 'dag-runs', dag, 'dag-runs');
}

function logsRoot(dag: string, runId: string): string {
  return path.join(daguHome(), 'logs', dag, runId);
}

function assertNames(dag: string, runId?: string) {
  if (!DAG_NAME.test(dag)) throw new Error('Nom de DAG invalide');
  if (runId !== undefined && !RUN_ID.test(runId))
    throw new Error('Identifiant de run invalide');
}

async function listDirsDesc(dir: string, pattern: RegExp): Promise<string[]> {
  try {
    return (await readdir(dir))
      .filter((n) => pattern.test(n))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** Dernière ligne de la dernière tentative d'un run (null si illisible). */
async function readStatus(
  runDir: string,
): Promise<{ line: StatusLine; attempt: string } | null> {
  const attempts = await listDirsDesc(runDir, /^a_/);
  for (const attempt of attempts) {
    try {
      const raw = await readFile(
        path.join(runDir, attempt, 'status.jsonl'),
        'utf8',
      );
      const last = raw.split('\n').filter(Boolean).pop();
      if (last) return { line: JSON.parse(last) as StatusLine, attempt };
    } catch {
      // tentative sans statut lisible : on essaie la précédente
    }
  }
  return null;
}

function toIso(value: string | undefined): string | null {
  return value && !value.startsWith('0001-') ? value : null;
}

function summarize(runId: string, line: StatusLine): RunSummary {
  const status = line.status ?? 0;
  const startedAt = toIso(line.startedAt);
  const finishedAt = toIso(line.finishedAt);
  return {
    runId,
    status,
    statusLabel: RUN_STATUS_LABELS[status] ?? `Statut ${status}`,
    trigger: TRIGGER_LABELS[line.triggerType ?? 0] ?? 'inconnu',
    startedAt,
    finishedAt,
    durationSec:
      startedAt && finishedAt
        ? Math.max(
            0,
            Math.round(
              (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) /
                1000,
            ),
          )
        : null,
  };
}

/** Runs d'un DAG, du plus récent au plus ancien (au plus `limit`). */
export async function listRuns(dag: string, limit = 30): Promise<RunSummary[]> {
  assertNames(dag);
  const root = runsRoot(dag);
  const out: RunSummary[] = [];
  for (const year of await listDirsDesc(root, /^\d{4}$/)) {
    for (const month of await listDirsDesc(path.join(root, year), /^\d{2}$/)) {
      for (const day of await listDirsDesc(
        path.join(root, year, month),
        /^\d{2}$/,
      )) {
        const dayDir = path.join(root, year, month, day);
        for (const runId of await listDirsDesc(dayDir, RUN_ID)) {
          const status = await readStatus(path.join(dayDir, runId));
          if (status) out.push(summarize(runId, status.line));
          if (out.length >= limit) return out;
        }
      }
    }
  }
  return out;
}

/** Retrouve le dossier de statut d'un run (jour déduit de l'horodatage). */
function runDirOf(dag: string, runId: string): string {
  const ts = runId.split('_')[1]; // AAAAMMJJ
  return path.join(
    runsRoot(dag),
    ts.slice(0, 4),
    ts.slice(4, 6),
    ts.slice(6, 8),
    runId,
  );
}

export async function getRunDetail(
  dag: string,
  runId: string,
): Promise<RunDetail | null> {
  assertNames(dag, runId);
  const status = await readStatus(runDirOf(dag, runId));
  if (!status) return null;
  const nodes = status.line.nodes ?? [];
  return {
    ...summarize(runId, status.line),
    hasRunLog: Boolean(status.line.log),
    steps: nodes.map((n) => {
      const st = n.status ?? 0;
      return {
        name: n.step?.name ?? '?',
        status: st,
        statusLabel: STEP_STATUS_LABELS[st] ?? `Statut ${st}`,
        startedAt: toIso(n.startedAt),
        finishedAt: toIso(n.finishedAt),
        error: n.error || null,
        hasStdout: Boolean(n.stdout),
        hasStderr: Boolean(n.stderr),
      };
    }),
  };
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

/** Fin d'un fichier (au plus maxBytes), sans la ligne coupée en tête. */
export async function readTail(
  file: string,
  maxBytes = MAX_LOG_BYTES,
): Promise<LogContent> {
  const { size } = await stat(file);
  const length = Math.min(size, maxBytes);
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    let text = buffer.toString('utf8');
    const truncated = size > length;
    if (truncated) {
      const nl = text.indexOf('\n');
      text = nl >= 0 ? text.slice(nl + 1) : text;
    }
    return { content: text.replace(ANSI, ''), truncated, size };
  } finally {
    await handle.close();
  }
}

/**
 * Journal d'un run ou d'une étape. Le chemin vient du statut écrit par Dagu,
 * jamais de l'appelant, et doit rester dans logs/<dag>/<run>/.
 */
export async function readRunLog(
  dag: string,
  runId: string,
  target: LogTarget,
): Promise<LogContent | null> {
  assertNames(dag, runId);
  const status = await readStatus(runDirOf(dag, runId));
  if (!status) return null;
  let file: string | undefined;
  if (target.kind === 'run') {
    file = status.line.log;
  } else {
    const node = (status.line.nodes ?? []).find(
      (n) => n.step?.name === target.step,
    );
    file = target.stream === 'out' ? node?.stdout : node?.stderr;
  }
  if (!file) return null;
  const resolved = path.resolve(file);
  const allowed = logsRoot(dag, runId) + path.sep;
  if (!resolved.startsWith(allowed)) return null;
  try {
    return await readTail(resolved);
  } catch {
    return null;
  }
}
