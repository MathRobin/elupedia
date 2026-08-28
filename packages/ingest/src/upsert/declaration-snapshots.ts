import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, declarationSnapshots } from '@elupedia/shared';
import { eq, and, sql } from 'drizzle-orm';
import type { Declaration } from '../sources/hatvp.js';
import { logger } from '../logger.js';

export async function upsertDeclarationSnapshots(
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

    const existing = await db
      .select()
      .from(declarationSnapshots)
      .where(
        and(
          eq(declarationSnapshots.officialId, officialId),
          eq(declarationSnapshots.declarationDate, decl.date_depot),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
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
        })
        .where(eq(declarationSnapshots.id, existing[0].id));
      summary.updated++;
    }
  }

  logger.info(
    `Declaration snapshots: ${summary.created} created, ${summary.updated} updated`,
  );
  return summary;
}
