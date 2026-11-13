/**
 * Déclenchement manuel d'un DAG Dagu depuis /ingestions : appelle
 * `scripts/trigger-dag.sh <dag>` à la racine du dépôt, qui met le run en file
 * (`dagu enqueue`) ; le scheduler du service dagu.service l'exécute avec son
 * environnement habituel. Le script rend la main immédiatement, l'avancement
 * se suit dans l'UI Dagu. Valable seulement sur la machine d'ingestion
 * (lib/runtime.ts). Le nom de DAG est restreint à `[A-Za-z0-9._-]` et doit
 * correspondre à un fichier dagu-dags/<nom>.yaml : rien n'est interprété par
 * un shell (execFile).
 */
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { repoRoot } from './repo-root';
import { hasLocalMachine, NO_LOCAL_MACHINE_MESSAGE } from './runtime';

const run = promisify(execFile);

export const DAG_NAME = /^[A-Za-z0-9._-]+$/;

export async function triggerDag(dag: string): Promise<string> {
  if (!hasLocalMachine()) throw new Error(NO_LOCAL_MACHINE_MESSAGE);
  if (!DAG_NAME.test(dag)) throw new Error('Nom de DAG invalide');
  const root = repoRoot();
  try {
    await access(path.join(root, 'dagu-dags', `${dag}.yaml`));
  } catch {
    throw new Error(`DAG inconnu : ${dag}`);
  }
  try {
    const { stdout } = await run(
      path.join(root, 'scripts', 'trigger-dag.sh'),
      [dag],
      { cwd: root, timeout: 30_000 },
    );
    return stdout.trim();
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error((err.stderr || err.message).trim(), { cause: e });
  }
}
