import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, interests } from '@elupedia/shared';
import { eq, and, sql } from 'drizzle-orm';
import type { Declaration } from '../sources/hatvp.js';
import { logger } from '../logger.js';

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
          type: item.type,
          entityName: item.entity_name,
          roleDescription: item.role_description ?? null,
          declaredDate: item.declared_date,
          full: item.full ?? null,
        });
        summary.created++;
      } else {
        await db
          .update(interests)
          .set({
            roleDescription: item.role_description ?? null,
            declaredDate: item.declared_date,
            full: item.full ?? null,
          })
          .where(eq(interests.id, existing[0].id));
        summary.updated++;
      }
    }
  }

  logger.info(
    `Interests: ${summary.created} created, ${summary.updated} updated`,
  );
  return summary;
}
