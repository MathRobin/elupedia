import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, staffers } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { CollaborateursDepute } from '../sources/an-collaborateurs.js';

export async function upsertStaffers(
  db: NeonHttpDatabase,
  deputeCollabs: CollaborateursDepute[],
) {
  const results = [];

  for (const depute of deputeCollabs) {
    const existing = await db
      .select()
      .from(officials)
      .where(eq(officials.anId, depute.id_an))
      .limit(1);

    if (existing.length === 0) continue;

    const officialId = existing[0].id;
    const today = new Date().toISOString().split('T')[0];

    for (const collab of depute.collaborateurs) {
      const existingStaffer = await db
        .select()
        .from(staffers)
        .where(
          and(
            eq(staffers.officialId, officialId),
            eq(staffers.firstName, collab.prenom),
            eq(staffers.lastName, collab.nom),
          ),
        )
        .limit(1);

      if (existingStaffer.length === 0) {
        await db.insert(staffers).values({
          officialId,
          firstName: collab.prenom,
          lastName: collab.nom,
          startDate: today,
        });
      }

      results.push({ officialId, name: `${collab.prenom} ${collab.nom}` });
    }
  }

  return results;
}
