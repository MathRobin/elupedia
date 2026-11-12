'use server';

/**
 * Journaux Dagu : liste des DAGs du dépôt avec leur dernier run, runs d'un DAG,
 * détail d'un run (étapes) et contenu d'un journal (run ou étape, sortie ou
 * erreur). Lecture sur le disque de la machine d'ingestion (lib/dagu-logs.ts) ;
 * sur l'admin hébergée (lib/runtime.ts) rien n'est lisible, la page l'indique.
 * Réservé aux admins : les journaux contiennent des requêtes SQL, des chemins
 * et des erreurs d'API que les modérateurs n'ont pas à voir.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { auth } from '@/lib/auth';
import { repoRoot } from '@/lib/repo-root';
import { hasLocalMachine } from '@/lib/runtime';
import {
  getRunDetail,
  listRuns,
  readRunLog,
  type LogContent,
  type LogTarget,
  type RunDetail,
  type RunSummary,
} from '@/lib/dagu-logs';

async function requireAdmin() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== 'admin') {
    throw new Error('Forbidden');
  }
}

async function dagFiles(): Promise<string[]> {
  return (await readdir(path.join(repoRoot(), 'dagu-dags')))
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''))
    .sort();
}

/** Refuse un DAG absent du dépôt : le nom vient du navigateur. */
async function assertKnownDag(dag: string) {
  if (!(await dagFiles()).includes(dag))
    throw new Error(`DAG inconnu : ${dag}`);
}

export interface LogsDagRow {
  name: string;
  description: string;
  lastRun: RunSummary | null;
}

export interface LogsOverview {
  /** false sur l'admin hébergée : journaux écrits sur la machine d'ingestion. */
  available: boolean;
  dags: LogsDagRow[];
}

export async function loadLogsOverview(): Promise<LogsOverview> {
  await requireAdmin();
  const available = hasLocalMachine();
  const dags: LogsDagRow[] = [];
  for (const name of await dagFiles()) {
    const doc = loadYaml(
      await readFile(
        path.join(repoRoot(), 'dagu-dags', `${name}.yaml`),
        'utf8',
      ),
    ) as { description?: string };
    dags.push({
      name,
      description: doc.description ?? name,
      lastRun: available ? ((await listRuns(name, 1))[0] ?? null) : null,
    });
  }
  return { available, dags };
}

export async function loadDagRuns(
  dag: string,
): Promise<{ available: boolean; runs: RunSummary[] }> {
  await requireAdmin();
  await assertKnownDag(dag);
  if (!hasLocalMachine()) return { available: false, runs: [] };
  return { available: true, runs: await listRuns(dag, 50) };
}

export async function loadRunDetail(
  dag: string,
  runId: string,
): Promise<RunDetail | null> {
  await requireAdmin();
  await assertKnownDag(dag);
  if (!hasLocalMachine()) return null;
  return getRunDetail(dag, runId);
}

export async function loadRunLog(
  dag: string,
  runId: string,
  target: LogTarget,
): Promise<LogContent | null> {
  await requireAdmin();
  await assertKnownDag(dag);
  if (!hasLocalMachine()) return null;
  return readRunLog(dag, runId, target);
}
