/**
 * Upsert des « instantanés » de déclarations HATVP : une ligne par dépôt
 * (date, type de déclaration, URL du document) pour tracer l'historique des
 * déclarations d'un élu, indépendamment du détail des intérêts (table
 * `interests`, géré par `interests.ts`). Données issues de
 * `sources/hatvp.ts`, appelé par `run-interests.ts`.
 *
 * Table écrite : `declaration_snapshots`.
 * Clé de rapprochement : (official_id, declaration_date). L'official est
 * retrouvé par NOM|PRÉNOM en majuscules — les homonymes stricts
 * s'écrasent dans le cache (le dernier chargé gagne), et les déclarants
 * absents de la base sont ignorés.
 * Idempotent : une ligne existante est réécrite à chaque run (type et URL),
 * sans comparaison préalable.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, declarationSnapshots } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { Declaration } from '../sources/hatvp.js';
import { logger } from '../logger.js';

// Un log de progression toutes les N déclarations.
const PROGRESS_LOG_EVERY = 200;

function officialNameKey(lastName: string, firstName: string): string {
  return `${lastName.toUpperCase()}|${firstName.toUpperCase()}`;
}

async function buildOfficialNameCache(
  db: NeonHttpDatabase,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
    })
    .from(officials);

  const cache = new Map<string, string>();
  for (const row of rows) {
    cache.set(officialNameKey(row.lastName, row.firstName), row.id);
  }
  return cache;
}

async function buildSnapshotCache(
  db: NeonHttpDatabase,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      id: declarationSnapshots.id,
      officialId: declarationSnapshots.officialId,
      declarationDate: declarationSnapshots.declarationDate,
    })
    .from(declarationSnapshots);

  const cache = new Map<string, string>();
  for (const row of rows) {
    cache.set(`${row.officialId}|${row.declarationDate}`, row.id);
  }
  return cache;
}

/**
 * Insère ou réécrit un snapshot par (official, date de dépôt) (écriture DB).
 * Retourne les compteurs created / updated.
 */
export async function upsertDeclarationSnapshots(
  db: NeonHttpDatabase,
  declarations: Declaration[],
) {
  const summary = { created: 0, updated: 0 };

  const cacheLoadStart = Date.now();
  const officialCache = await buildOfficialNameCache(db);
  const snapshotCache = await buildSnapshotCache(db);
  logger.info(`  Snapshot caches loaded (${Date.now() - cacheLoadStart}ms)`);

  const processingStart = Date.now();
  logger.info(`  ${declarations.length} declarations to process`);

  for (let i = 0; i < declarations.length; i++) {
    const declaration = declarations[i];

    if (i % PROGRESS_LOG_EVERY === 0) {
      logger.info(`  [${i + 1}/${declarations.length}] snapshots...`);
    }

    const officialId = officialCache.get(
      officialNameKey(declaration.nom, declaration.prenom),
    );
    if (!officialId) continue;

    const snapshotKey = `${officialId}|${declaration.date_depot}`;
    const existingId = snapshotCache.get(snapshotKey);

    try {
      if (!existingId) {
        await db.insert(declarationSnapshots).values({
          officialId,
          declarationDate: declaration.date_depot,
          declarationType: declaration.declaration_type ?? 'initial',
          sourceDocumentUrl: declaration.source_document_url ?? null,
        });
        summary.created++;
      } else {
        await db
          .update(declarationSnapshots)
          .set({
            declarationType: declaration.declaration_type ?? 'initial',
            sourceDocumentUrl: declaration.source_document_url ?? null,
            updatedAt: new Date(),
          })
          .where(eq(declarationSnapshots.id, existingId));
        summary.updated++;
      }
    } catch (error) {
      logger.error(
        `  Failed processing snapshot for ${declaration.nom} ${declaration.prenom} (${declaration.date_depot}): ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  const durationMs = Date.now() - processingStart;
  logger.info(
    `Declaration snapshots: ${summary.created} created, ${summary.updated} updated (${durationMs}ms)`,
  );
  return summary;
}
