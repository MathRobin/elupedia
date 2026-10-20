'use server';

/**
 * Tableau de bord des ingestions : les DAGs Dagu du dépôt (dagu-dags/*.yaml :
 * nom, cron, commandes) rapprochés des rapports de fin de run écrits par
 * chaque main-*.ts dans packages/ingest (ingest-report-*.json : compteurs,
 * erreurs ; la date du fichier vaut date de fin du dernier run). Lecture sur
 * le disque de la machine qui exécute les ingestions, donc celle de l'admin.
 * L'API Dagu locale exige une authentification qui n'est pas configurée ici :
 * l'état « en cours / échoué » de Dagu n'est pas remonté, seuls les rapports
 * le sont.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { auth } from '@/lib/auth';
import { repoRoot } from '@/lib/shorts-jobs';

async function requireAuthenticatedUser() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!role || (role !== 'admin' && role !== 'moderator')) {
    throw new Error('Forbidden');
  }
}

export interface DagInfo {
  file: string;
  name: string;
  schedule: string | null;
  scheduleLabel: string;
  commands: string[];
  /** Suffixes de rapport attendus, déduits des commandes (`ingest:an` → `an`). */
  reportKeys: string[];
}

export interface ReportInfo {
  key: string;
  file: string;
  writtenAt: string;
  hasChanges: boolean;
  totalCreated: number;
  totalUpdated: number;
  totalErrors: number;
  changedSources: string[];
}

export interface IngestionsDashboard {
  dags: DagInfo[];
  reports: ReportInfo[];
  reportsDir: string;
  dagsDir: string;
}

const DAYS = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
];

/** Traduction lisible des crons rencontrés dans le dépôt (UTC). */
export async function describeCron(cron: string | null): Promise<string> {
  if (!cron) return 'manuel';
  const m = cron.trim().match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/);
  if (!m) return cron;
  const [, min, hour, dom, , dow] = m;
  const time =
    /^\d+$/.test(hour) && /^\d+$/.test(min)
      ? `${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`
      : null;
  if (hour.includes('/') && dom === '*' && dow === '*')
    return `toutes les ${hour.split('/')[1]} h (${cron})`;
  if (hour.includes(',') && dom === '*' && dow === '*')
    return `à ${hour
      .split(',')
      .map((h) => `${h}h`)
      .join(', ')} UTC`;
  if (!time) return cron;
  if (dom === '*' && dow === '*') return `tous les jours à ${time}`;
  if (dom === '*' && /^\d$/.test(dow))
    return `le ${DAYS[Number(dow)]} à ${time}`;
  if (/^\d+$/.test(dom) && dow === '*') return `le ${dom} du mois à ${time}`;
  if (dom.includes('/') && dow === '*')
    return `tous les ${dom.split('/')[1]} jours (${dom}) à ${time}`;
  return cron;
}

/**
 * Clés des rapports qu'une commande de DAG peut produire : `ingest:a:b` →
 * `a-b` (fichier ingest-report-a-b.json), `ingest` seul → clé vide
 * (ingest-report.json), et les outils `reconcile` / `merge:duplicate-officials`
 * sous leur propre nom.
 */
function reportKeysFromCommand(command: string): string[] {
  const keys: string[] = [];
  const m = command.match(/ingest:([a-z-]+(?::[a-z-]+)*)/);
  if (m) keys.push(m[1].replace(/:/g, '-'));
  if (/yarn --cwd packages\/ingest ingest\b(?!:)/.test(command)) keys.push('');
  const tool = command.match(
    /yarn --cwd packages\/ingest (reconcile|merge:duplicate-officials)\b/,
  );
  if (tool) keys.push(tool[1].replace(/:/g, '-'));
  return keys;
}

export async function loadIngestionsDashboard(): Promise<IngestionsDashboard> {
  await requireAuthenticatedUser();
  const root = repoRoot();
  const dagsDir = path.join(root, 'dagu-dags');
  const reportsDir = path.join(root, 'packages', 'ingest');

  const dags: DagInfo[] = [];
  for (const file of (await readdir(dagsDir))
    .filter((f) => f.endsWith('.yaml'))
    .sort()) {
    const doc = loadYaml(await readFile(path.join(dagsDir, file), 'utf8')) as {
      name?: string;
      schedule?: string;
      steps?: { name?: string; command?: string }[];
    };
    const commands = (doc.steps ?? [])
      .map((s) => s.command ?? '')
      .filter((c) => c.startsWith('yarn --cwd packages/'));
    dags.push({
      file,
      name: doc.name ?? file,
      schedule: doc.schedule ?? null,
      scheduleLabel: await describeCron(doc.schedule ?? null),
      commands,
      reportKeys: commands.flatMap(reportKeysFromCommand),
    });
  }

  const reports: ReportInfo[] = [];
  for (const file of (await readdir(reportsDir))
    .filter((f) => /^ingest-report.*\.json$/.test(f))
    .sort()) {
    try {
      const full = path.join(reportsDir, file);
      const [raw, info] = await Promise.all([
        readFile(full, 'utf8'),
        stat(full),
      ]);
      const r = JSON.parse(raw) as Partial<ReportInfo>;
      reports.push({
        key: file.replace(/^ingest-report-?/, '').replace(/\.json$/, ''),
        file,
        writtenAt: info.mtime.toISOString(),
        hasChanges: Boolean(r.hasChanges),
        totalCreated: r.totalCreated ?? 0,
        totalUpdated: r.totalUpdated ?? 0,
        totalErrors: r.totalErrors ?? 0,
        changedSources: r.changedSources ?? [],
      });
    } catch {
      // rapport illisible : ignoré
    }
  }
  return { dags, reports, reportsDir, dagsDir };
}
