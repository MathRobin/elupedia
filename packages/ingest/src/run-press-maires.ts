/**
 * Orchestration de l'ingestion presse « tous élus » : à chaque run, un lot
 * des N élus vivants vérifiés le moins récemment (`officials.press_checked_at`,
 * jamais vérifiés en premier), une recherche Google Actualités chacun, puis
 * upsert des articles. Le nom historique « maires » est resté alors que le
 * périmètre couvre tous les mandats.
 *
 * Convention du package : les `run-*.ts` portent la logique testable — pas
 * de parsing d'arguments, pas de process.exit() — et sont lancés par le
 * `main-*.ts` du même nom (`yarn --cwd packages/ingest ingest:press:maires`).
 * Ouvre sa propre connexion DB via createDb(). Chaque étape passe par
 * runStep() : fetch + upsert rejoués en cas d'échec, erreur consignée dans
 * le StepResult sans interrompre les étapes suivantes.
 *
 * Filtres optionnels (validés par le main) : code département et/ou type de
 * mandat, qui restreignent aux élus ayant un mandat *en cours* correspondant.
 * Sans filtre, la sélection se fait sur `officials` seule (un élu sans
 * mandat en base est quand même traité).
 */
import {
  createDb,
  officials,
  mandates,
  DEPARTMENT_NAMES,
} from '@elupedia/shared';
import { isNull, eq, and, ilike, sql } from 'drizzle-orm';

import { logger } from './logger.js';
import { type StepResult, runStep, printSummary } from './run-helpers.js';
import { fetchPressMentions } from './sources/google-news.js';
import { upsertPressMentions } from './upsert/press-mentions.js';

/** Taille du lot par défaut (≈ 1500 × 3 s ≈ 75 min par run). Surchargeable via --limit. */
export const DEFAULT_BATCH_SIZE = 1500;
// Pause entre deux recherches Google Actualités (flux RSS non officiel,
// bloque rapidement les rafales).
const DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lance l'ingestion presse d'un lot d'élus. `departmentCode` est un code
 * INSEE (ex. « 94 », « 2A ») déjà validé contre DEPARTMENT_NAMES ;
 * `mandateType` une valeur de `mandates.type`. Écrit en base, y compris
 * `press_checked_at` pour chaque élu du lot.
 */
export async function runPressAllOfficials(
  batchSize: number = DEFAULT_BATCH_SIZE,
  departmentCode?: string,
  mandateType?: string,
): Promise<StepResult[]> {
  const db = createDb();
  const results: StepResult[] = [];

  logger.info('=== Press ingestion (all officials) started ===\n');

  // Deux requêtes distinctes : avec filtre, il faut joindre `mandates`
  // (selectDistinct, car un élu peut cumuler plusieurs mandats qualifiants) ;
  // sans filtre, on reste sur `officials` pour ne pas exclure les élus sans
  // mandat en base. Dans les deux cas, « nulls first » = jamais vérifiés
  // en tête de file.
  let batch;
  if (departmentCode || mandateType) {
    const conditions = [isNull(officials.deathDate), isNull(mandates.endDate)];
    const filterLabels: string[] = [];

    if (departmentCode) {
      // mandates.department stocke le libellé, pas le code.
      const departmentName = DEPARTMENT_NAMES[departmentCode];
      conditions.push(ilike(mandates.department, departmentName));
      filterLabels.push(`${departmentName} (${departmentCode})`);
    }
    if (mandateType) {
      conditions.push(eq(mandates.type, mandateType));
      filterLabels.push(`mandat "${mandateType}"`);
    }

    batch = await db
      .selectDistinct({
        id: officials.id,
        firstName: officials.firstName,
        lastName: officials.lastName,
        pressCheckedAt: officials.pressCheckedAt,
      })
      .from(officials)
      .innerJoin(mandates, eq(mandates.officialId, officials.id))
      .where(and(...conditions))
      .orderBy(sql`${officials.pressCheckedAt} asc nulls first`)
      .limit(batchSize);

    logger.info(
      `${batch.length} officials selected (${filterLabels.join(', ')})\n`,
    );
  } else {
    batch = await db
      .select({
        id: officials.id,
        firstName: officials.firstName,
        lastName: officials.lastName,
      })
      .from(officials)
      .where(isNull(officials.deathDate))
      .orderBy(sql`${officials.pressCheckedAt} asc nulls first`)
      .limit(batchSize);

    logger.info(
      `${batch.length} officials selected (least recently checked first, batch of ${batchSize})\n`,
    );
  }

  results.push(
    await runStep('google-news-maires', async () => {
      let totalCreated = 0;
      let totalUpdated = 0;

      for (let i = 0; i < batch.length; i++) {
        const official = batch[i];
        logger.info(
          `  [${i + 1}/${batch.length}] ${official.firstName} ${official.lastName}`,
        );

        try {
          const mentions = await fetchPressMentions(
            official.id,
            official.firstName,
            official.lastName,
          );
          const upsert = await upsertPressMentions(db, mentions);
          totalCreated += upsert.created;
          totalUpdated += upsert.updated;
          logger.info(
            `    → ${mentions.length} articles, ${upsert.created} new`,
          );
        } catch (err) {
          logger.warn(
            `    → error: ${err instanceof Error ? err.message : String(err)}`,
          );
        } finally {
          // Marqué comme vérifié même en cas d'erreur, pour ne pas bloquer
          // indéfiniment cet élu en tête de file au prochain run.
          await db
            .update(officials)
            .set({ pressCheckedAt: new Date() })
            .where(eq(officials.id, official.id));
        }

        if (i < batch.length - 1) {
          await sleep(DELAY_MS);
        }
      }

      return {
        source: 'google-news-maires',
        created: totalCreated,
        updated: totalUpdated,
        durationMs: 0,
      };
    }),
  );

  printSummary('Press ingestion (all officials)', results, logger);
  return results;
}
