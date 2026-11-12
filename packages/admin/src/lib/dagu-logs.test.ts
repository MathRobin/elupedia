/**
 * Tests de lib/dagu-logs.ts sur un DAGU_HOME factice (dossier temporaire) :
 * liste des runs, détail des étapes, lecture d'un journal par la fin et refus
 * des noms ou chemins hors de logs/<dag>/<run>/.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getRunDetail, listRuns, readRunLog, readTail } from './dagu-logs';

const home = mkdtempSync(path.join(tmpdir(), 'dagu-'));
const RUN = 'dag-run_20261112_170000Z_abc123';

function writeRun(runId: string, status: number, outside = false) {
  const day = runId.split('_')[1];
  const dir = path.join(
    home,
    'data/dag-runs/demo/dag-runs',
    day.slice(0, 4),
    day.slice(4, 6),
    day.slice(6, 8),
    runId,
    'a_1',
  );
  const logDir = path.join(home, 'logs/demo', runId);
  mkdirSync(dir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  writeFileSync(path.join(logDir, 'run.log'), 'run ok\n');
  writeFileSync(path.join(logDir, 'step.out'), 'a\nb\nc\n');
  writeFileSync(
    path.join(dir, 'status.jsonl'),
    `${JSON.stringify({ status: 1 })}\n` +
      JSON.stringify({
        status,
        triggerType: 2,
        startedAt: '2026-11-12T17:00:00Z',
        finishedAt: '2026-11-12T17:01:05Z',
        log: path.join(logDir, 'run.log'),
        nodes: [
          {
            step: { name: 'select' },
            status: 2,
            error: 'exit status 1',
            stdout: outside ? '/etc/passwd' : path.join(logDir, 'step.out'),
            stderr: path.join(logDir, 'missing.err'),
            startedAt: '2026-11-12T17:00:00Z',
            finishedAt: '2026-11-12T17:00:02Z',
          },
        ],
      }) +
      '\n',
  );
}

beforeAll(() => {
  process.env.DAGU_HOME = home;
  writeRun(RUN, 2);
  writeRun('dag-run_20261111_170000Z_old999', 4);
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

describe('dagu-logs', () => {
  it('liste les runs du plus récent au plus ancien avec la dernière ligne de statut', async () => {
    const runs = await listRuns('demo');
    expect(runs.map((r) => r.runId)).toEqual([
      RUN,
      'dag-run_20261111_170000Z_old999',
    ]);
    expect(runs[0]).toMatchObject({
      status: 2,
      statusLabel: 'Échoué',
      trigger: 'manuel',
      durationSec: 65,
    });
    expect(await listRuns('demo', 1)).toHaveLength(1);
    expect(await listRuns('inconnu')).toEqual([]);
  });

  it('détaille les étapes', async () => {
    const detail = await getRunDetail('demo', RUN);
    expect(detail?.hasRunLog).toBe(true);
    expect(detail?.steps[0]).toMatchObject({
      name: 'select',
      statusLabel: 'Échouée',
      error: 'exit status 1',
      hasStdout: true,
    });
    expect(
      await getRunDetail('demo', 'dag-run_20200101_000000Z_zzz'),
    ).toBeNull();
  });

  it('lit le journal d’une étape et du run', async () => {
    const out = await readRunLog('demo', RUN, {
      kind: 'step',
      step: 'select',
      stream: 'out',
    });
    expect(out?.content).toBe('a\nb\nc\n');
    expect((await readRunLog('demo', RUN, { kind: 'run' }))?.content).toBe(
      'run ok\n',
    );
    expect(
      await readRunLog('demo', RUN, {
        kind: 'step',
        step: 'select',
        stream: 'err',
      }),
    ).toBeNull();
  });

  it('refuse les noms invalides et les chemins hors du dossier du run', async () => {
    await expect(listRuns('../etc')).rejects.toThrow('Nom de DAG invalide');
    await expect(getRunDetail('demo', '../../x')).rejects.toThrow(
      'Identifiant de run invalide',
    );
    const evil = 'dag-run_20261110_170000Z_evil1';
    writeRun(evil, 2, true);
    expect(
      await readRunLog('demo', evil, {
        kind: 'step',
        step: 'select',
        stream: 'out',
      }),
    ).toBeNull();
  });

  it('coupe un gros fichier par la fin, sans la ligne tronquée, et retire les codes ANSI', async () => {
    const file = path.join(home, 'big.log');
    const esc = String.fromCharCode(27);
    writeFileSync(file, `${esc}[31mrouge${esc}[0m\nligne2\nligne3\n`);
    const tail = await readTail(file, 14);
    expect(tail.truncated).toBe(true);
    expect(tail.content).toBe('ligne3\n');
    expect((await readTail(file)).content).toBe('rouge\nligne2\nligne3\n');
  });
});
