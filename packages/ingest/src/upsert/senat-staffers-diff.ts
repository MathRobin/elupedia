import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, staffers } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { CollaborateursSenateur } from '../sources/senat-collaborateurs.js';

export async function diffSenatStaffers(
  db: NeonHttpDatabase,
  senateurCollabs: CollaborateursSenateur[],
) {
  const today = new Date().toISOString().split('T')[0];
  const summary = { created: 0, ended: 0, unchanged: 0 };

  for (const senateur of senateurCollabs) {
    const [official] = await db
      .select()
      .from(officials)
      .where(eq(officials.senatId, senateur.matricule))
      .limit(1);

    if (!official) continue;

    const currentStaffers = await db
      .select()
      .from(staffers)
      .where(
        and(eq(staffers.officialId, official.id), isNull(staffers.endDate)),
      );

    const incomingNames = new Set(
      senateur.collaborateurs.map((c) => `${c.prenom}|${c.nom}`),
    );

    const existingNames = new Set(
      currentStaffers.map((s) => `${s.firstName}|${s.lastName}`),
    );

    for (const collab of senateur.collaborateurs) {
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
          .set({ endDate: today, updatedAt: new Date() })
          .where(eq(staffers.id, existing.id));
        summary.ended++;
      }
    }
  }

  return summary;
}
