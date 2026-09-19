import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, staffers } from '@elupedia/shared';
import { eq, isNull } from 'drizzle-orm';
import type { CollaborateursSenateur } from '../sources/senat-collaborateurs.js';

export async function diffSenatStaffers(
  db: NeonHttpDatabase,
  senateurCollabs: CollaborateursSenateur[],
) {
  const today = new Date().toISOString().split('T')[0];
  const summary = { created: 0, ended: 0, unchanged: 0 };

  const allOfficials = await db
    .select({ id: officials.id, senatId: officials.senatId })
    .from(officials);
  const officialByMatricule = new Map<string, string>();
  for (const o of allOfficials) {
    if (o.senatId) officialByMatricule.set(o.senatId, o.id);
  }

  const activeStaffers = await db
    .select()
    .from(staffers)
    .where(isNull(staffers.endDate));
  const staffersByOfficialId = new Map<
    string,
    (typeof staffers.$inferSelect)[]
  >();
  for (const s of activeStaffers) {
    const list = staffersByOfficialId.get(s.officialId) ?? [];
    list.push(s);
    staffersByOfficialId.set(s.officialId, list);
  }

  const newRows: (typeof staffers.$inferInsert)[] = [];

  for (const senateur of senateurCollabs) {
    const officialId = officialByMatricule.get(senateur.matricule);
    if (!officialId) continue;

    const currentStaffers = staffersByOfficialId.get(officialId) ?? [];

    const incomingNames = new Set(
      senateur.collaborateurs.map((c) => `${c.prenom}|${c.nom}`),
    );

    const existingNames = new Set(
      currentStaffers.map((s) => `${s.firstName}|${s.lastName}`),
    );

    for (const collab of senateur.collaborateurs) {
      const key = `${collab.prenom}|${collab.nom}`;
      if (!existingNames.has(key)) {
        newRows.push({
          officialId,
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

  if (newRows.length > 0) {
    await db.insert(staffers).values(newRows);
  }

  return summary;
}
