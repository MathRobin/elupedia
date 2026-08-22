import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, interests } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { Declaration } from '../sources/hatvp.js';

export async function upsertInterests(
  db: NeonHttpDatabase,
  declarations: Declaration[],
) {
  const summary = { created: 0, updated: 0 };

  for (const decl of declarations) {
    const [official] = await db
      .select()
      .from(officials)
      .where(eq(officials.anId, decl.id_an))
      .limit(1);

    if (!official) continue;

    for (const item of decl.interests) {
      const existing = await db
        .select()
        .from(interests)
        .where(
          and(
            eq(interests.officialId, official.id),
            eq(interests.entityName, item.entity_name),
            eq(interests.type, item.type),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(interests).values({
          officialId: official.id,
          type: item.type,
          entityName: item.entity_name,
          roleDescription: item.role_description ?? null,
          declaredDate: item.declared_date,
        });
        summary.created++;
      } else {
        await db
          .update(interests)
          .set({
            roleDescription: item.role_description ?? null,
            declaredDate: item.declared_date,
          })
          .where(eq(interests.id, existing[0].id));
        summary.updated++;
      }
    }
  }

  return summary;
}
