/**
 * Lancement, depuis l'admin, des commandes longues de packages/shorts (make,
 * script, import de la voix, rendu) sous forme de tâches détachées : un
 * processus `yarn --cwd packages/shorts …` par tâche, journal écrit dans
 * `<out>/<id>/jobs/`, état dans `<out>/<id>/jobs/current.json`. L'admin tourne
 * sur la machine de rendu, comme le dossier de sortie. Une seule tâche à la
 * fois par short ; la page de détail interroge l'état toutes les deux
 * secondes. Liste blanche de commandes : rien n'est composé à partir de
 * l'entrée utilisateur hormis l'identifiant UUID.
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { shortsOutputDir } from './shorts-files';

export const SHORT_JOBS = {
  make: {
    label: 'Tout enchaîner (make)',
    args: (id: string) => ['make', id],
  },
  'make-silent': {
    label: 'Rendre sans voix (make --silent)',
    args: (id: string) => ['make', id, '--silent'],
  },
  rescript: {
    label: 'Regénérer le script (script --force)',
    args: (id: string) => ['script', '--id', id, '--force'],
  },
  sheet: {
    label: 'Fiche de lecture (voiceover sheet)',
    args: (id: string) => ['voiceover', 'sheet', '--id', id],
  },
  import: {
    label: 'Importer les prises (voiceover import)',
    args: (id: string) => ['voiceover', 'import', '--id', id],
  },
  render: {
    label: 'Rendre la vidéo (render --force)',
    args: (id: string) => ['render', '--id', id, '--force'],
  },
  'render-draft': {
    label: 'Rendu rapide de contrôle (render --force --draft)',
    args: (id: string) => ['render', '--id', id, '--force', '--draft'],
  },
} as const;

export type ShortJobKind = keyof typeof SHORT_JOBS;

export interface ShortJobState {
  kind: ShortJobKind;
  pid: number;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'done' | 'failed';
  exitCode: number | null;
  logFile: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jobsDir(shortId: string): string {
  return path.join(shortsOutputDir(), shortId, 'jobs');
}

export function repoRoot(): string {
  return path.resolve(process.cwd(), '..', '..');
}

export async function readShortJob(
  shortId: string,
): Promise<ShortJobState | null> {
  try {
    const raw = await readFile(
      path.join(jobsDir(shortId), 'current.json'),
      'utf8',
    );
    const state = JSON.parse(raw) as ShortJobState;
    // Un processus disparu sans écrire sa fin (reboot, kill) est marqué échoué.
    if (state.status === 'running' && !isAlive(state.pid)) {
      state.status = 'failed';
      state.finishedAt = new Date().toISOString();
      await writeState(shortId, state);
    }
    return state;
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function writeState(
  shortId: string,
  state: ShortJobState,
): Promise<void> {
  await writeFile(
    path.join(jobsDir(shortId), 'current.json'),
    JSON.stringify(state, null, 2),
  );
}

export async function startShortJob(
  shortId: string,
  kind: ShortJobKind,
): Promise<ShortJobState> {
  if (!UUID.test(shortId)) throw new Error('Identifiant invalide');
  const job = SHORT_JOBS[kind];
  if (!job) throw new Error('Commande inconnue');
  const current = await readShortJob(shortId);
  if (current?.status === 'running') {
    throw new Error(
      `Une tâche est déjà en cours (${SHORT_JOBS[current.kind].label})`,
    );
  }

  const dir = jobsDir(shortId);
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(dir, `${kind}-${stamp}.log`);
  await writeFile(
    logFile,
    `$ yarn --cwd packages/shorts ${job.args(shortId).join(' ')}\n\n`,
  );

  const child = spawn(
    'yarn',
    ['--cwd', 'packages/shorts', ...job.args(shortId)],
    {
      cwd: repoRoot(),
      env: { ...process.env, FORCE_COLOR: '0' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const append = (chunk: Buffer) => {
    void writeFile(logFile, chunk, { flag: 'a' });
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);

  const state: ShortJobState = {
    kind,
    pid: child.pid ?? -1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    exitCode: null,
    logFile,
  };
  await writeState(shortId, state);

  child.on('exit', (code) => {
    void writeState(shortId, {
      ...state,
      status: code === 0 ? 'done' : 'failed',
      exitCode: code,
      finishedAt: new Date().toISOString(),
    });
  });
  child.unref();
  return state;
}

export async function readShortJobLog(
  shortId: string,
  maxLines = 60,
): Promise<string> {
  const state = await readShortJob(shortId);
  if (!state) return '';
  try {
    const text = await readFile(state.logFile, 'utf8');
    const lines = text.split('\n');
    return lines.slice(Math.max(0, lines.length - maxLines)).join('\n');
  } catch {
    return '';
  }
}
