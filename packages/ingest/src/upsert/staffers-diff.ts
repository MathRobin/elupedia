import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, staffers } from '@elupedia/shared';
import { eq, isNull } from 'drizzle-orm';
import type { CollaborateursDepute } from '../sources/an-collaborateurs.js';
import { writeProvenanceBatch } from './provenance.js';

const SOURCE_NAME = 'Assemblée nationale - Open Data';
const LEGAL_BASIS =
  'Données publiques de collaborateurs parlementaires (art. L311-1 CRPA)';

export async function diffStaffers(
  db: NeonHttpDatabase,
  deputeCollabs: CollaborateursDepute[],
) {
  const today = new Date().toISOString().split('T')[0];
  const summary = { created: 0, ended: 0, unchanged: 0 };

  const allOfficials = await db
    .select({ id: officials.id, anId: officials.anId })
    .from(officials);
  const officialByAnId = new Map<string, string>();
  for (const o of allOfficials) {
    if (o.anId) officialByAnId.set(o.anId, o.id);
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
  const provenanceItems: Parameters<typeof writeProvenanceBatch>[1] = [];

  for (const depute of deputeCollabs) {
    const officialId = officialByAnId.get(depute.id_an);
    if (!officialId) continue;

    const currentStaffers = staffersByOfficialId.get(officialId) ?? [];

    const incomingNames = new Set(
      depute.collaborateurs.map((c) => `${c.prenom}|${c.nom}`),
    );

    const existingNames = new Set(
      currentStaffers.map((s) => `${s.firstName}|${s.lastName}`),
    );

    for (const collab of depute.collaborateurs) {
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

    provenanceItems.push({
      sourceTable: 'staffers',
      sourceRecordId: depute.id_an,
      sourceName: SOURCE_NAME,
      sourceUrl: `https://www.assemblee-nationale.fr/dyn/deputes/${depute.id_an}`,
      legalBasis: LEGAL_BASIS,
      rawData: depute,
    });
  }

  if (newRows.length > 0) {
    await db.insert(staffers).values(newRows);
  }

  await writeProvenanceBatch(db, provenanceItems);

  return summary;
}
