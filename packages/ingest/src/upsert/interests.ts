import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, interests } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { Declaration } from '../sources/hatvp.js';
import { logger } from '../logger.js';
import { writeProvenance } from './provenance.js';

const SOURCE_NAME = "HATVP - Déclarations d'intérêts";
const LEGAL_BASIS =
  "Déclaration d'intérêts et d'activités (loi n°2013-907 du 11 octobre 2013 relative à la transparence de la vie publique)";

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
    const key = `${row.lastName.toUpperCase()}|${row.firstName.toUpperCase()}`;
    cache.set(key, row.id);
  }
  return cache;
}

async function buildExistingInterestsCache(
  db: NeonHttpDatabase,
): Promise<Map<string, string>> {
  const rows = await db
    .select({
      id: interests.id,
      officialId: interests.officialId,
      entityName: interests.entityName,
      type: interests.type,
    })
    .from(interests);

  const cache = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.officialId}|${row.entityName}|${row.type}`;
    cache.set(key, row.id);
  }
  return cache;
}

export async function upsertInterests(
  db: NeonHttpDatabase,
  declarations: Declaration[],
) {
  const summary = { created: 0, updated: 0 };

  const t0 = Date.now();
  const officialCache = await buildOfficialCache(db);
  logger.info(
    `  Officials cache: ${officialCache.size} entries (${Date.now() - t0}ms)`,
  );

  const t1 = Date.now();
  const existingCache = await buildExistingInterestsCache(db);
  logger.info(
    `  Interests cache: ${existingCache.size} entries (${Date.now() - t1}ms)`,
  );

  const t2 = Date.now();

  for (const decl of declarations) {
    const cacheKey = `${decl.nom.toUpperCase()}|${decl.prenom.toUpperCase()}`;
    const officialId = officialCache.get(cacheKey);
    if (!officialId) continue;

    for (const item of decl.interests) {
      const interestKey = `${officialId}|${item.entity_name}|${item.type}`;
      const existingId = existingCache.get(interestKey);

      if (!existingId) {
        await db.insert(interests).values({
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
      } else {
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
          .where(eq(interests.id, existingId));
        summary.updated++;
      }

      await writeProvenance(db, {
        sourceTable: 'interests',
        sourceRecordId: `${officialId}:${item.type}:${item.entity_name}`,
        sourceName: SOURCE_NAME,
        sourceUrl: 'https://www.hatvp.fr/consulter-les-declarations/',
        legalBasis: LEGAL_BASIS,
        rawData: item.full,
      });
    }
  }

  const durationMs = Date.now() - t2;
  logger.info(
    `Interests: ${summary.created} created, ${summary.updated} updated (${durationMs}ms)`,
  );
  return summary;
}
