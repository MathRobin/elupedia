import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, interests } from '@elupedia/shared';
import { eq, and, sql } from 'drizzle-orm';
import type { Declaration } from '../sources/hatvp.js';
import { logger } from '../logger.js';
import { writeProvenance } from './provenance.js';

const SOURCE_NAME = "HATVP - Déclarations d'intérêts";
const LEGAL_BASIS =
  "Déclaration d'intérêts et d'activités (loi n°2013-907 du 11 octobre 2013 relative à la transparence de la vie publique)";

export async function upsertInterests(
  db: NeonHttpDatabase,
  declarations: Declaration[],
) {
  const summary = { created: 0, updated: 0 };

  for (const decl of declarations) {
    const matches = await db
      .select({ id: officials.id })
      .from(officials)
      .where(
        and(
          eq(sql`upper(${officials.lastName})`, decl.nom.toUpperCase()),
          eq(sql`upper(${officials.firstName})`, decl.prenom.toUpperCase()),
        ),
      )
      .limit(1);

    if (matches.length === 0) continue;
    const officialId = matches[0].id;

    for (const item of decl.interests) {
      const existing = await db
        .select()
        .from(interests)
        .where(
          and(
            eq(interests.officialId, officialId),
            eq(interests.entityName, item.entity_name),
            eq(interests.type, item.type),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
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
          })
          .where(eq(interests.id, existing[0].id));
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

  logger.info(
    `Interests: ${summary.created} created, ${summary.updated} updated`,
  );
  return summary;
}
