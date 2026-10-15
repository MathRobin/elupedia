/**
 * Point d'entrée CLI de l'ingestion des conseillers régionaux (source RNE).
 *
 * Commande : `yarn --cwd packages/ingest ingest:conseillers-reg [--only … | --skip … | --help]`
 *
 * Convention du package : un `main-*.ts` est un point d'entrée CLI, et rien
 * d'autre — il parse les arguments, lance l'orchestrateur `run-*.ts` du même
 * nom, écrit le rapport de changements et fixe le code de sortie. Toute la
 * logique (lecture des sources, upserts) vit dans le `run-*.ts`, testable
 * sans processus ni process.exit().
 *
 * Le rapport JSON écrit à la racine du package et la sortie GITHUB_OUTPUT
 * (voir utils/change-detector.ts) servent à l'orchestrateur à décider s'il
 * faut reconstruire le site. Logique dans `run-conseillers-reg.ts`.
 */
import { logger } from './logger.js';
import { parseCliArgs, CONSEILLERS_REG_STEP_NAMES } from './cli.js';
import { runConseillersReg } from './run-conseillers-reg.js';
import {
  detectChanges,
  writeChangeReport,
  setGitHubOutput,
} from './utils/change-detector.js';

// null = --help affiché par parseCliArgs : on sort sans rien lancer.
let enabledSteps;
try {
  enabledSteps = parseCliArgs(undefined, CONSEILLERS_REG_STEP_NAMES);
} catch (error) {
  logger.error(String(error));
  process.exit(1);
}

if (!enabledSteps) {
  process.exit(0);
}

runConseillersReg(enabledSteps)
  .then((results) => {
    const report = detectChanges(results);
    writeChangeReport(report, 'ingest-report-conseillers-reg.json');
    setGitHubOutput(report);

    logger.info(`Rebuild needed: ${report.hasChanges ? 'YES' : 'NO'}`);

    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Ingestion Conseillers régionaux failed: ${error}`);
    process.exit(1);
  });
