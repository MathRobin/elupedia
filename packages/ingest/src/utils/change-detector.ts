import { writeFileSync, appendFileSync } from 'node:fs';

interface StepResult {
  source: string;
  created: number;
  updated: number;
  error?: string;
}

export interface ChangeReport {
  hasChanges: boolean;
  totalCreated: number;
  totalUpdated: number;
  totalErrors: number;
  changedSources: string[];
}

export function detectChanges(results: StepResult[]): ChangeReport {
  const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
  const totalErrors = results.filter((r) => r.error).length;
  const changedSources = results
    .filter((r) => r.created > 0 || r.updated > 0)
    .map((r) => r.source);

  return {
    hasChanges: totalCreated + totalUpdated > 0,
    totalCreated,
    totalUpdated,
    totalErrors,
    changedSources,
  };
}

export function writeChangeReport(
  report: ChangeReport,
  filePath: string,
): void {
  writeFileSync(filePath, JSON.stringify(report, null, 2) + '\n');
}

export function setGitHubOutput(report: ChangeReport): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;

  appendFileSync(
    outputFile,
    `has_changes=${report.hasChanges}\n` +
      `total_created=${report.totalCreated}\n` +
      `total_updated=${report.totalUpdated}\n` +
      `changed_sources=${report.changedSources.join(',')}\n`,
  );
}
