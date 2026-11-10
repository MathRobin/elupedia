import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

/**
 * Rapport de fin de run des commandes shorts planifiées par Dagu (`select`,
 * `script`, `voiceover generate`, `render`, `publish`), pour la page
 * Ingestions de l'admin. Même forme et même dossier que les rapports
 * d'ingestion (`ChangeReport`, `packages/ingest/ingest-report-*.json`) :
 * l'admin les lit tous au même endroit et les rattache aux DAGs par leur
 * commande (`shorts-<étape>`). `totalCreated` = shorts traités avec succès
 * (candidats créés, scripts, voix, vidéos, vidéos mises en ligne),
 * `totalErrors` = shorts en échec, ou 1 si la commande a échoué avant de
 * traiter quoi que ce soit (clé absente, token YouTube refusé…).
 *
 * Pièges : pas de rapport en `--dry-run` (rien n'a été fait) ; l'écriture
 * n'échoue jamais la commande ; `rebuild:site` ne lit pas ces fichiers (seuls
 * ceux passés en `--report` dans les DAGs), un short ne change pas le site.
 * Appelants : main-select.ts, main-script.ts, main-voiceover.ts,
 * main-render.ts, main-publish.ts.
 */

export type ShortsStep =
  'select' | 'script' | 'voiceover' | 'render' | 'publish';

export interface ShortsReport {
  hasChanges: boolean;
  totalCreated: number;
  totalUpdated: number;
  totalErrors: number;
  changedSources: string[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
/** `packages/ingest`, où l'admin lit les rapports. */
export const REPORTS_DIR = path.resolve(here, '../../ingest');

export function reportFile(step: ShortsStep, dir = REPORTS_DIR): string {
  return path.join(dir, `ingest-report-shorts-${step}.json`);
}

export function shortsReport(
  step: ShortsStep,
  counts: { done: number; failed: number },
): ShortsReport {
  return {
    hasChanges: counts.done > 0,
    totalCreated: counts.done,
    totalUpdated: 0,
    totalErrors: counts.failed,
    changedSources: counts.done > 0 ? [`shorts-${step}`] : [],
  };
}

const written = new Set<ShortsStep>();

/** Écrit le rapport de l'étape ; ne lève jamais. */
export function writeShortsReport(
  step: ShortsStep,
  counts: { done: number; failed: number },
  dir = REPORTS_DIR,
): void {
  try {
    writeFileSync(
      reportFile(step, dir),
      JSON.stringify(shortsReport(step, counts), null, 2) + '\n',
    );
    written.add(step);
  } catch (error) {
    logger.warn(`rapport shorts-${step} non écrit : ${error}`);
  }
}

/**
 * Échec de la commande entière : rapport à une erreur, sauf si le run a déjà
 * écrit le sien (les échecs par short y sont comptés).
 */
export function writeShortsFailureReport(
  step: ShortsStep,
  dir = REPORTS_DIR,
): void {
  if (written.has(step)) return;
  writeShortsReport(step, { done: 0, failed: 1 }, dir);
}
