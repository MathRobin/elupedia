/**
 * Diff des collaborateurs parlementaires des députés (open data AN,
 * `sources/an-collaborateurs.ts`), appelé par `run-an.ts` (`ingest:an`).
 * Pendant AN de `upsert/senat-staffers-diff.ts`.
 *
 * Tables écrites : `staffers` et `data_provenance` (une entrée par député).
 * Clé de rapprochement : official (via `an_id`) + prénom|nom exacts (casse
 * comprise) parmi les collaborateurs actifs (`end_date IS NULL`).
 *
 * La source est une photo instantanée sans dates : un collaborateur inconnu
 * est ouvert à la date du jour, un collaborateur actif absent de la photo est
 * clos à la date du jour. Les dates réelles ne sont donc connues qu'à la
 * précision de la fréquence d'ingestion. Idempotent.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, staffers } from '@elupedia/shared';
import { eq, isNull } from 'drizzle-orm';
import type { CollaborateursDepute } from '../sources/an-collaborateurs.js';
import { writeProvenanceBatch } from './provenance.js';
import { logger } from '../logger.js';

const SOURCE_NAME = 'Assemblée nationale - Open Data';
const LEGAL_BASIS =
  'Données publiques de collaborateurs parlementaires (art. L311-1 CRPA)';

/**
 * Ouvre les nouveaux collaborateurs, clôt les disparus, écrit la provenance.
 * Écrit dans `staffers` et `data_provenance`. Retourne créés / clos /
 * inchangés.
 */
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
  for (const official of allOfficials) {
    if (official.anId) officialByAnId.set(official.anId, official.id);
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
  const provenanceItems: Parameters<typeof writeProvenanceBatch>[1] = [];

  for (const depute of deputeCollabs) {
    const officialId = officialByAnId.get(depute.id_an);
    if (!officialId) continue;

    const currentStaffers = staffersByOfficialId.get(officialId) ?? [];

    const incomingNames = new Set(
      depute.collaborateurs.map((collab) => `${collab.prenom}|${collab.nom}`),
    );

    const existingNames = new Set(
      currentStaffers.map(
        (staffer) => `${staffer.firstName}|${staffer.lastName}`,
      ),
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

  logger.info(
    `Staffers: ${summary.created} created, ${summary.ended} ended, ${summary.unchanged} unchanged`,
  );
  return summary;
}
