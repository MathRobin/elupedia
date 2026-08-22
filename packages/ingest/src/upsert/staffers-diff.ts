import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, staffers } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { CollaborateursDepute } from '../sources/an-collaborateurs.js';

export async function diffStaffers(
  db: NeonHttpDatabase,
  deputeCollabs: CollaborateursDepute[],
) {
  const today = new Date().toISOString().split('T')[0];
  const summary = { created: 0, ended: 0, unchanged: 0 };

  for (const depute of deputeCollabs) {
    const [official] = await db
      .select()
      .from(officials)
      .where(eq(officials.anId, depute.id_an))
      .limit(1);

    if (!official) continue;

    const currentStaffers = await db
      .select()
      .from(staffers)
      .where(
        and(eq(staffers.officialId, official.id), isNull(staffers.endDate)),
      );

    const incomingNames = new Set(
      depute.collaborateurs.map((c) => `${c.prenom}|${c.nom}`),
    );

    const existingNames = new Set(
      currentStaffers.map((s) => `${s.firstName}|${s.lastName}`),
    );

    for (const collab of depute.collaborateurs) {
      const key = `${collab.prenom}|${collab.nom}`;
      if (!existingNames.has(key)) {
        await db.insert(staffers).values({
          officialId: official.id,
          firstName: collab.prenom,
          lastName: collab.nom,
          startDate: today,
        });
        summary.created++;
      } else {
        summary.unchanged++;
      }
    }

    for (const existing of currentStaffers) {
      const key = `${existing.firstName}|${existing.lastName}`;
      if (!incomingNames.has(key)) {
        await db
          .update(staffers)
          .set({ endDate: today })
          .where(eq(staffers.id, existing.id));
        summary.ended++;
      }
    }
  }

  return summary;
}
