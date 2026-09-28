import { parseArgs } from 'node:util';
import { DEPARTMENT_NAMES, MANDATE_TYPE_LABELS } from '@elupedia/shared';
import { logger } from './logger.js';
import { runPressMaires, DEFAULT_BATCH_SIZE } from './run-press-maires.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

// Dérivé de MANDATE_TYPE_LABELS plutôt qu'une liste codée en dur : une
// liste séparée avait déjà divergé (conseiller_regional, conseiller_
// arrondissement et membre_assemblee_statut_particulier étaient rejetés
// par --type alors que ces mandats sont bien ingérés). "president" est
// exclu : présent dans les libellés d'affichage mais produit par aucun
// script d'ingestion, donc jamais présent en tant que mandates.type.
const MANDATE_TYPES = Object.keys(MANDATE_TYPE_LABELS).filter(
  (type) => type !== 'president',
);

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    limit: { type: 'string' },
    department: { type: 'string' },
    type: { type: 'string' },
  },
  strict: true,
});

let batchSize = DEFAULT_BATCH_SIZE;
if (values.limit !== undefined) {
  const parsed = parseInt(values.limit, 10);
  if (isNaN(parsed) || parsed <= 0) {
    logger.error(
      `--limit invalide : "${values.limit}" (entier positif attendu)`,
    );
    process.exit(1);
  }
  batchSize = parsed;
}

if (values.department !== undefined && !DEPARTMENT_NAMES[values.department]) {
  logger.error(
    `--department invalide : "${values.department}" (code département attendu, ex. 94, 33, 2A)`,
  );
  process.exit(1);
}

if (values.type !== undefined && !MANDATE_TYPES.includes(values.type)) {
  logger.error(
    `--type invalide : "${values.type}" (types attendus : ${MANDATE_TYPES.join(', ')})`,
  );
  process.exit(1);
}

runPressMaires(batchSize, values.department, values.type)
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-press-maires.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Press maires ingestion failed: ${error}`);
    process.exit(1);
  });
