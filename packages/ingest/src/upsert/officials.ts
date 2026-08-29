import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { Depute } from '../sources/assemblee-nationale.js';
import { writeProvenance } from './provenance.js';

const SOURCE_NAME = 'Assemblée nationale - Open Data';
const LEGAL_BASIS =
  'Données publiques de mandat parlementaire (art. L311-1 CRPA)';

export async function upsertOfficials(db: NeonHttpDatabase, deputes: Depute[]) {
  const results = [];

  for (const depute of deputes) {
    const anId = depute.id_an;

    const existing = await db
      .select()
      .from(officials)
      .where(eq(officials.anId, anId))
      .limit(1);

    let officialId: string;

    if (existing.length > 0) {
      officialId = existing[0].id;
      await db
        .update(officials)
        .set({
          firstName: depute.prenom,
          lastName: depute.nom,
          birthDate: depute.date_naissance,
          photoUrl: depute.photo_url ?? null,
          deathDate: depute.death_date ?? null,
          full: depute.full,
        })
        .where(eq(officials.id, officialId));
    } else {
      const [inserted] = await db
        .insert(officials)
        .values({
          firstName: depute.prenom,
          lastName: depute.nom,
          anId,
          birthDate: depute.date_naissance,
          photoUrl: depute.photo_url ?? null,
          deathDate: depute.death_date ?? null,
          full: depute.full,
        })
        .returning();
      officialId = inserted!.id;
    }

    const existingMandate = await db
      .select()
      .from(mandates)
      .where(eq(mandates.officialId, officialId))
      .limit(1);

    if (existingMandate.length === 0) {
      await db.insert(mandates).values({
        officialId,
        type: depute.mandat_type,
        district: `${depute.num_circo}e circonscription`,
        department: depute.nom_circo,
        startDate: depute.mandat_debut,
        endDate: depute.mandat_fin ?? null,
        politicalGroup: depute.groupe_sigle ?? null,
      });
    } else {
      await db
        .update(mandates)
        .set({
          district: `${depute.num_circo}e circonscription`,
          department: depute.nom_circo,
          endDate: depute.mandat_fin ?? null,
          politicalGroup: depute.groupe_sigle ?? null,
        })
        .where(eq(mandates.id, existingMandate[0].id));
    }

    await writeProvenance(db, {
      sourceTable: 'officials',
      sourceRecordId: anId,
      sourceName: SOURCE_NAME,
      sourceUrl: `https://www.assemblee-nationale.fr/dyn/deputes/${anId}`,
      legalBasis: LEGAL_BASIS,
      rawData: depute.full,
    });

    results.push({ officialId, anId });
  }

  return results;
}
