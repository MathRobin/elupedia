/**
 * Orchestration post-scrutin des sénatoriales 2026 : une seule lecture des
 * résultats par circonscription dépouillée, exploitée par deux étapes —
 * les résultats nominatifs (upsert/senat-resultats-2026.ts), puis la mise à
 * jour des fiches et mandats : création des nouveaux sénateurs, ouverture
 * et clôture des mandats (upsert/senat-mandats-2026.ts). Voir docs/DOMAINS.md.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:senat:resultats`).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * Le fetch est volontairement hors de runStep : s'il échoue, aucune des
 * deux étapes ne doit tourner (le main sort en erreur).
 */
import { createDb } from '@elupedia/shared';
import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchSenatorialResults2026 } from './sources/senat-resultats-2026.js';
import { upsertSenatorialResults2026 } from './upsert/senat-resultats-2026.js';
import { upsertSenatMandats2026 } from './upsert/senat-mandats-2026.js';

/** Lance les deux étapes post-scrutin. Écrit en base. */
export async function runSenatResultats(): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Sénatoriales 2026 : résultats post-scrutin ===\n');

  const departements = await fetchSenatorialResults2026();
  logger.info(
    `  ${departements.length} circonscriptions dépouillées récupérées`,
  );

  results.push(
    await runStep('senat-resultats-2026', async () => {
      const summary = await upsertSenatorialResults2026(db, departements);
      return {
        source: 'senat-resultats-2026',
        created: summary.candidates,
        updated: 0,
        durationMs: 0,
      };
    }),
  );

  results.push(
    await runStep('senat-mandats-2026', async () => {
      const summary = await upsertSenatMandats2026(db, departements);
      // created = nouvelles fiches + mandats ouverts, updated = mandats clos.
      return {
        source: 'senat-mandats-2026',
        created: summary.officialsCreated + summary.mandatesOpened,
        updated: summary.mandatesClosed,
        durationMs: 0,
      };
    }),
  );

  printSummary('Sénatoriales 2026 : résultats post-scrutin', results, logger);
  return results;
}
