/**
 * Diff des collaborateurs des sénateurs (open data Sénat,
 * `sources/senat-collaborateurs.ts`), appelé par `run-senat.ts`
 * (`ingest:senat`). Pendant Sénat de `upsert/staffers-diff.ts`.
 *
 * Table écrite : `staffers`.
 * Clé de rapprochement : official (via `senat_id` = matricule) + prénom|nom
 * exacts (casse comprise) parmi les collaborateurs actifs (`end_date IS NULL`).
 *
 * La source est une photo instantanée sans dates : un collaborateur inconnu
 * est ouvert à la date du jour, un collaborateur actif absent de la photo est
 * clos à la date du jour. Les dates réelles d'entrée/sortie ne sont donc
 * connues qu'à la précision de la fréquence d'ingestion. Idempotent.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, staffers } from '@elupedia/shared';
import { eq, isNull } from 'drizzle-orm';
import type { CollaborateursSenateur } from '../sources/senat-collaborateurs.js';
import { logger } from '../logger.js';

/**
 * Ouvre les nouveaux collaborateurs et clôt les disparus. Écrit dans
 * `staffers`. Retourne créés / clos / inchangés.
 */
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
  for (const official of allOfficials) {
    if (official.senatId)
      officialByMatricule.set(official.senatId, official.id);
  }

  const activeStaffers = await db
    .select()
    .from(staffers)
    .where(isNull(staffers.endDate));
  const staffersByOfficialId = new Map<
    string,
    (typeof staffers.$inferSelect)[]
  >();
  for (const staffer of activeStaffers) {
    const list = staffersByOfficialId.get(staffer.officialId) ?? [];
    list.push(staffer);
    staffersByOfficialId.set(staffer.officialId, list);
  }

  const newRows: (typeof staffers.$inferInsert)[] = [];

  for (const senateur of senateurCollabs) {
    const officialId = officialByMatricule.get(senateur.matricule);
    if (!officialId) continue;

    const currentStaffers = staffersByOfficialId.get(officialId) ?? [];

    const incomingNames = new Set(
      senateur.collaborateurs.map((collab) => `${collab.prenom}|${collab.nom}`),
    );

    const existingNames = new Set(
      currentStaffers.map(
        (staffer) => `${staffer.firstName}|${staffer.lastName}`,
      ),
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

  logger.info(
    `Sénat staffers: ${summary.created} created, ${summary.ended} ended, ${summary.unchanged} unchanged`,
  );
  return summary;
}
