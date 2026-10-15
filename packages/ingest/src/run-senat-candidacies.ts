/**
 * Orchestration de l'ingestion des candidatures aux sénatoriales 2026
 * (pré-scrutin) : lit les listes officielles par circonscription
 * (sources/senat-candidacies-2026.ts) et les enregistre
 * (upsert/senat-candidacies.ts). Voir docs/DOMAINS.md.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:senat:candidacies`).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * Script à durée de vie limitée (un scrutin) : après le vote, c'est
 * run-senat-resultats.ts qui prend le relais.
 */
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchSenatorialCandidacies2026 } from './sources/senat-candidacies-2026.js';
import { upsertSenatorialCandidacies } from './upsert/senat-candidacies.js';

/** Lance l'ingestion des candidatures (une seule étape). Écrit en base. */
export async function runSenatCandidacies(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Sénatoriales 2026 : candidatures ===\n');

  results.push(
    await runStep('senat-candidacies-2026', async () => {
      const departements = await fetchSenatorialCandidacies2026();
      logger.info(`  ${departements.length} circonscriptions récupérées`);

      const summary = await upsertSenatorialCandidacies(db, departements);

      return {
        source: 'senat-candidacies-2026',
        created: summary.candidates,
        updated: 0,
        durationMs: 0,
      };
    }),
  );

  printSummary('Sénatoriales 2026 : candidatures', results, logger);
  return results;
}
