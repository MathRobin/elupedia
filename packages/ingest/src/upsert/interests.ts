/**
 * Upsert du détail des déclarations d'intérêts HATVP (une ligne par
 * intérêt déclaré : activité, participation, mandat…). Données issues de
 * `sources/hatvp.ts`, appelé par `run-interests.ts` (avec
 * `declaration-snapshots.ts` pour l'historique des dépôts).
 *
 * Tables écrites : `interests` (+ `data_provenance`, une ligne par intérêt,
 * rawData = l'objet source complet `item.full`).
 * Clé de rapprochement : (official_id, entity_name, type). L'official est
 * retrouvé par NOM|PRÉNOM en majuscules — les homonymes stricts
 * s'écrasent dans le cache (le dernier chargé gagne), et les déclarants
 * absents de la base sont ignorés.
 * Idempotent : une ligne existante n'est réécrite que si l'un des champs
 * comparés a changé ; `type` et `entity_name` font partie de la clé et ne
 * sont donc jamais mis à jour. Un intérêt disparu d'une déclaration
 * ultérieure n'est pas supprimé (pas de clôture : la source fournit ses
 * propres dates de début/fin).
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, interests } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { Declaration } from '../sources/hatvp.js';
import { logger } from '../logger.js';
import { writeProvenanceBatch } from './provenance.js';

const SOURCE_NAME = "HATVP - Déclarations d'intérêts";
const LEGAL_BASIS =
  "Déclaration d'intérêts et d'activités (loi n°2013-907 du 11 octobre 2013 relative à la transparence de la vie publique)";

// Taille max d'un INSERT multi-lignes.
const INSERT_CHUNK_SIZE = 500;
// Un log de progression toutes les N déclarations.
const PROGRESS_LOG_EVERY = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function officialNameKey(lastName: string, firstName: string): string {
  return `${lastName.toUpperCase()}|${firstName.toUpperCase()}`;
}

async function buildOfficialCache(
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

async function buildExistingInterestsCache(
  db: NeonHttpDatabase,
): Promise<Map<string, typeof interests.$inferSelect>> {
  const rows = await db.select().from(interests);

  const cache = new Map<string, typeof interests.$inferSelect>();
  for (const row of rows) {
    const key = `${row.officialId}|${row.entityName}|${row.type}`;
    cache.set(key, row);
  }
  return cache;
}

/**
 * Insère les intérêts inconnus, met à jour ceux qui ont changé et écrit la
 * provenance de chacun (écriture DB). Retourne les compteurs
 * created / updated.
 */
export async function upsertInterests(
  db: NeonHttpDatabase,
  declarations: Declaration[],
) {
  const summary = { created: 0, updated: 0 };

  const officialCacheStart = Date.now();
  const officialCache = await buildOfficialCache(db);
  logger.info(
    `  Officials cache: ${officialCache.size} entries (${Date.now() - officialCacheStart}ms)`,
  );

  const interestsCacheStart = Date.now();
  const existingCache = await buildExistingInterestsCache(db);
  logger.info(
    `  Interests cache: ${existingCache.size} entries (${Date.now() - interestsCacheStart}ms)`,
  );

  const processingStart = Date.now();
  logger.info(`  ${declarations.length} declarations to process`);

  const newInterestRows: (typeof interests.$inferInsert)[] = [];
  const provenanceItems: Parameters<typeof writeProvenanceBatch>[1] = [];

  for (let i = 0; i < declarations.length; i++) {
    const declaration = declarations[i];

    if (i % PROGRESS_LOG_EVERY === 0) {
      logger.info(`  [${i + 1}/${declarations.length}] declarations...`);
    }

    const officialId = officialCache.get(
      officialNameKey(declaration.nom, declaration.prenom),
    );
    if (!officialId) continue;

    for (const item of declaration.interests) {
      const interestKey = `${officialId}|${item.entity_name}|${item.type}`;
      const existing = existingCache.get(interestKey);

      if (!existing) {
        newInterestRows.push({
          officialId,
          category: item.category,
          type: item.type,
          entityName: item.entity_name,
          roleDescription: item.role_description ?? null,
          declaredDate: item.declared_date,
          startDate: item.start_date ?? null,
          endDate: item.end_date ?? null,
          full: item.full ?? null,
          declarantComment: item.declarant_comment ?? null,
          sourceDocumentUrl: item.source_document_url ?? null,
          ownershipDetail: item.ownership_detail ?? null,
          annualAmount: item.annual_amount ?? null,
          amountYear: item.amount_year ?? null,
          amountIsNet: item.amount_is_net ?? null,
        });
        summary.created++;
      } else if (
        // `full` (objet source brut) n'entre pas dans la comparaison : il
        // n'est réécrit qu'à l'occasion d'un autre changement.
        existing.category !== item.category ||
        existing.roleDescription !== (item.role_description ?? null) ||
        existing.declaredDate !== item.declared_date ||
        existing.startDate !== (item.start_date ?? null) ||
        existing.endDate !== (item.end_date ?? null) ||
        existing.declarantComment !== (item.declarant_comment ?? null) ||
        existing.sourceDocumentUrl !== (item.source_document_url ?? null) ||
        existing.ownershipDetail !== (item.ownership_detail ?? null) ||
        existing.annualAmount !== (item.annual_amount ?? null) ||
        existing.amountYear !== (item.amount_year ?? null) ||
        existing.amountIsNet !== (item.amount_is_net ?? null)
      ) {
        await db
          .update(interests)
          .set({
            category: item.category,
            roleDescription: item.role_description ?? null,
            declaredDate: item.declared_date,
            startDate: item.start_date ?? null,
            endDate: item.end_date ?? null,
            full: item.full ?? null,
            declarantComment: item.declarant_comment ?? null,
            sourceDocumentUrl: item.source_document_url ?? null,
            ownershipDetail: item.ownership_detail ?? null,
            annualAmount: item.annual_amount ?? null,
            amountYear: item.amount_year ?? null,
            amountIsNet: item.amount_is_net ?? null,
            updatedAt: new Date(),
          })
          .where(eq(interests.id, existing.id));
        summary.updated++;
      }

      provenanceItems.push({
        sourceTable: 'interests',
        sourceRecordId: `${officialId}:${item.type}:${item.entity_name}`,
        sourceName: SOURCE_NAME,
        sourceUrl: 'https://www.hatvp.fr/consulter-les-declarations/',
        legalBasis: LEGAL_BASIS,
        rawData: item.full,
      });
    }
  }

  for (const rowChunk of chunk(newInterestRows, INSERT_CHUNK_SIZE)) {
    await db.insert(interests).values(rowChunk);
  }

  await writeProvenanceBatch(db, provenanceItems);

  const durationMs = Date.now() - processingStart;
  logger.info(
    `Interests: ${summary.created} created, ${summary.updated} updated (${durationMs}ms)`,
  );
  return summary;
}
