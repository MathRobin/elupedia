/**
 * Point d'entrée CLI du rebuild conditionnel du site (utils/deploy-hook.ts).
 *
 * Commande : `yarn --cwd packages/ingest rebuild:site --report ingest-report-an.json [--report …]`
 *
 * Étape finale des DAGs d'ingestion (dagu-dags/ingest-*.yaml) : appelle le
 * Deploy Hook Vercel si l'un des rapports cités a des changements. Ne lit pas
 * la base. Code de sortie 0 dans tous les cas sauf échec de l'appel du hook :
 * un rebuild manqué doit se voir dans Dagu, sans invalider l'ingestion déjà
 * faite (étape séparée).
 */
import { parseArgs } from 'node:util';
import { logger } from './logger.js';
import { triggerSiteRebuild } from './utils/deploy-hook.js';

const { values } = parseArgs({
  options: { report: { type: 'string', multiple: true } },
});
const reportFiles = values.report ?? [];
if (reportFiles.length === 0) {
  logger.error(
    'Usage : rebuild:site --report <ingest-report-*.json> [--report …]',
  );
  process.exit(1);
}

triggerSiteRebuild({
  reportFiles,
  hookUrl: process.env.VERCEL_DEPLOY_HOOK_URL,
})
  .then((outcome) => process.exit(outcome === 'failed' ? 1 : 0))
  .catch((error) => {
    logger.error(`Rebuild du site failed: ${error}`);
    process.exit(1);
  });
