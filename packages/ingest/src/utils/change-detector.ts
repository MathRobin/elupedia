/**
 * Bilan de fin de run pour l'orchestrateur externe (Dagu, anciennement
 * GitHub Actions) : à partir des StepResult, décide si quelque chose a
 * changé en base (→ rebuild du site), écrit un rapport JSON à la racine du
 * package et, en CI GitHub, exporte les mêmes valeurs dans $GITHUB_OUTPUT.
 *
 * Appelé par chaque main-*.ts après son run-*.ts. Le StepResult local est
 * un sous-ensemble structurel de celui de run-helpers.ts (durationMs
 * inutile ici) ; les deux doivent rester compatibles.
 */
import { writeFileSync, appendFileSync } from 'node:fs';

interface StepResult {
  source: string;
  created: number;
  updated: number;
  error?: string;
}

/** Rapport sérialisé tel quel dans ingest-report*.json. */
export interface ChangeReport {
  hasChanges: boolean;
  totalCreated: number;
  totalUpdated: number;
  totalErrors: number;
  changedSources: string[];
}

/** Agrège les compteurs ; `hasChanges` dès qu'une ligne a été créée ou mise à jour. */
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

/** Écrit le rapport en JSON indenté (chemin relatif au cwd du script). */
export function writeChangeReport(
  report: ChangeReport,
  filePath: string,
): void {
  writeFileSync(filePath, JSON.stringify(report, null, 2) + '\n');
}

/**
 * Exporte le rapport en sorties d'étape GitHub Actions (has_changes, …).
 * Sans $GITHUB_OUTPUT (cas Dagu, exécution locale), ne fait rien.
 */
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
