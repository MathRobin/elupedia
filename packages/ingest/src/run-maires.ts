/**
 * Orchestration de l'ingestion des maires : 5 étapes — maires et mandats
 * (RNE), adresses des mairies (DILA), photos (Wikidata), résultats des
 * municipales, scraping des sites de mairies pour les réseaux sociaux.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:maires`) et par run.ts (run complet).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * Les étapes RNE et DILA (~35 000 communes) sont longues et reprennent où
 * elles s'étaient arrêtées via utils/checkpoint.ts en cas d'interruption.
 */
import { createDb } from '@elupedia/shared';

import { logger } from './logger.js';
import { withRetry } from './utils/retry.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchRneMaires } from './sources/rne-maires.js';
import { upsertMayors } from './upsert/mayors.js';
import { fetchDilaMairies } from './sources/dila-mairies.js';
import { upsertMayorAddresses } from './upsert/mayor-addresses.js';
import { scrapeMayorWebsites } from './upsert/mayor-social-scrape.js';
import { fetchWikidataMayorPhotos } from './sources/wikidata-mayor-photos.js';
import { upsertMayorPhotos } from './upsert/mayor-photos.js';
import { fetchMunicipalElections } from './sources/municipal-elections.js';
import { upsertMunicipalElections } from './upsert/municipal-elections.js';

/**
 * Lance les étapes maires activées (toutes si `enabledSteps` est absent,
 * voir MAIRES_STEP_NAMES dans cli.ts). Écrit en base.
 */
export async function runMaires(
  enabledSteps?: Set<string>,
): Promise<StepResult[]> {
  const enabled = (name: string) => !enabledSteps || enabledSteps.has(name);
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Ingestion Maires started ===\n');

  if (enabled('maires')) {
    logger.info('[1/5] RNE maires...');
    results.push(
      await runStep('maires', async () => {
        const maires = await withRetry(() => fetchRneMaires(), {
          source: 'rne-maires',
        });
        const upsert = await upsertMayors(db, maires);
        // created = fiches officials touchées, updated = mandats touchés.
        return {
          source: 'maires',
          created: upsert.officials,
          updated: upsert.mandates,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('maires-addresses')) {
    logger.info('[2/5] DILA mairie addresses...');
    results.push(
      await runStep('maires-addresses', async () => {
        const mairies = await withRetry(() => fetchDilaMairies(), {
          source: 'dila-mairies',
        });
        const upsert = await upsertMayorAddresses(db, mairies);
        return {
          source: 'maires-addresses',
          created: upsert.created,
          updated: upsert.updated,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('maires-photos')) {
    logger.info('[3/5] Wikidata mayor photos...');
    results.push(
      await runStep('maires-photos', async () => {
        const photos = await withRetry(() => fetchWikidataMayorPhotos(), {
          source: 'wikidata-mayor-photos',
        });
        const upsert = await upsertMayorPhotos(db, photos);
        // created = photos posées sur une fiche, updated = maires reconnus
        // dans Wikidata (avec ou sans photo nouvelle).
        return {
          source: 'maires-photos',
          created: upsert.updated,
          updated: upsert.matched,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('maires-elections')) {
    logger.info('[4/5] Municipal election results...');
    results.push(
      await runStep('maires-elections', async () => {
        const elections = await withRetry(() => fetchMunicipalElections(), {
          source: 'municipal-elections',
        });
        const upsert = await upsertMunicipalElections(db, elections);
        // created = scrutins, updated = candidatures.
        return {
          source: 'maires-elections',
          created: upsert.elections,
          updated: upsert.candidates,
          durationMs: 0,
        };
      }),
    );
  }

  if (enabled('maires-social-scrape')) {
    logger.info('[5/5] Mayor website social links scrape...');
    results.push(
      await runStep('maires-social-scrape', async () => {
        const scrape = await scrapeMayorWebsites(db);
        // Pas de colonne « ignorés » dans StepResult : on recycle `updated`.
        return {
          source: 'maires-social-scrape',
          created: scrape.created,
          updated: scrape.skipped,
          durationMs: 0,
        };
      }),
    );
  }

  printSummary('Ingestion Maires', results, logger);
  return results;
}
