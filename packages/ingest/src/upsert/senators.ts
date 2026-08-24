import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { Senateur } from '../sources/senat.js';
import { logger } from '../logger.js';

export async function upsertSenators(
  db: NeonHttpDatabase,
  senateurs: Senateur[],
) {
  const summary = { officials: 0, mandates: 0 };

  for (const sen of senateurs) {
    const existing = await db
      .select()
      .from(officials)
      .where(eq(officials.senatId, sen.matricule))
      .limit(1);

    let officialId: string;

    if (existing.length > 0) {
      officialId = existing[0].id;
      await db
        .update(officials)
        .set({
          firstName: sen.prenom,
          lastName: sen.nom,
          birthDate: sen.date_naissance,
          photoUrl: sen.photo_url,
          full: sen.full,
        })
        .where(eq(officials.id, officialId));
    } else {
      const [inserted] = await db
        .insert(officials)
        .values({
          firstName: sen.prenom,
          lastName: sen.nom,
          senatId: sen.matricule,
          birthDate: sen.date_naissance,
          photoUrl: sen.photo_url,
          full: sen.full,
        })
        .returning();
      officialId = inserted!.id;
      summary.officials++;
    }

    for (const m of sen.mandats) {
      const existingMandat = await db
        .select()
        .from(mandates)
        .where(
          and(
            eq(mandates.officialId, officialId),
            eq(mandates.type, 'senateur'),
            eq(mandates.startDate, m.start_date),
          ),
        )
        .limit(1);

      if (existingMandat.length === 0) {
        await db.insert(mandates).values({
          officialId,
          type: 'senateur',
          department: m.department,
          startDate: m.start_date,
          endDate: m.end_date,
        });
        summary.mandates++;
      } else {
        await db
          .update(mandates)
          .set({
            department: m.department,
            endDate: m.end_date,
          })
          .where(eq(mandates.id, existingMandat[0].id));
      }
    }
  }

  logger.info(
    `Senators: ${summary.officials} new officials, ${summary.mandates} new mandates`,
  );
  return summary;
}
