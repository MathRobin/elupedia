import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, declarationSnapshots } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { Declaration } from '../sources/hatvp.js';
import { logger } from '../logger.js';

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
    const key = `${row.lastName.toUpperCase()}|${row.firstName.toUpperCase()}`;
    cache.set(key, row.id);
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

export async function upsertDeclarationSnapshots(
  db: NeonHttpDatabase,
  declarations: Declaration[],
) {
  const summary = { created: 0, updated: 0 };

  const t0 = Date.now();
  const officialCache = await buildOfficialNameCache(db);
  const snapshotCache = await buildSnapshotCache(db);
  logger.info(`  Snapshot caches loaded (${Date.now() - t0}ms)`);

  const t1 = Date.now();
  logger.info(`  ${declarations.length} declarations to process`);

  for (let i = 0; i < declarations.length; i++) {
    const decl = declarations[i];

    if (i % 200 === 0) {
      logger.info(`  [${i + 1}/${declarations.length}] snapshots...`);
    }

    const cacheKey = `${decl.nom.toUpperCase()}|${decl.prenom.toUpperCase()}`;
    const officialId = officialCache.get(cacheKey);
    if (!officialId) continue;

    const snapshotKey = `${officialId}|${decl.date_depot}`;
    const existingId = snapshotCache.get(snapshotKey);

    try {
      if (!existingId) {
        await db.insert(declarationSnapshots).values({
          officialId,
          declarationDate: decl.date_depot,
          declarationType: decl.declaration_type ?? 'initial',
          sourceDocumentUrl: decl.source_document_url ?? null,
        });
        summary.created++;
      } else {
        await db
          .update(declarationSnapshots)
          .set({
            declarationType: decl.declaration_type ?? 'initial',
            sourceDocumentUrl: decl.source_document_url ?? null,
            updatedAt: new Date(),
          })
          .where(eq(declarationSnapshots.id, existingId));
        summary.updated++;
      }
    } catch (error) {
      logger.error(
        `  Failed processing snapshot for ${decl.nom} ${decl.prenom} (${decl.date_depot}): ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  const durationMs = Date.now() - t1;
  logger.info(
    `Declaration snapshots: ${summary.created} created, ${summary.updated} updated (${durationMs}ms)`,
  );
  return summary;
}
