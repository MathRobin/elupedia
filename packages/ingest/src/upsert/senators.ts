import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { Senateur } from '../sources/senat.js';
import { logger } from '../logger.js';

function slugify(firstName: string, lastName: string): string {
  return `${firstName}-${lastName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function upsertSenators(
  db: NeonHttpDatabase,
  senateurs: Senateur[],
) {
  const summary = { officials: 0, mandates: 0, merged: 0 };

  for (const sen of senateurs) {
    const existing = await db
      .select()
      .from(officials)
      .where(eq(officials.senatId, sen.matricule))
      .limit(1);

    let officialId: string;

    const slug = slugify(sen.prenom, sen.nom);

    if (existing.length > 0) {
      officialId = existing[0].id;
      await db
        .update(officials)
        .set({
          firstName: sen.prenom,
          lastName: sen.nom,
          birthDate: sen.date_naissance,
          photoUrl: sen.photo_url,
          slug: existing[0].slug ?? slug,
          full: sen.full,
          updatedAt: new Date(),
        })
        .where(eq(officials.id, officialId));
    } else {
      const anMatch = sen.date_naissance
        ? await db
            .select()
            .from(officials)
            .where(
              and(
                eq(officials.lastName, sen.nom),
                eq(officials.firstName, sen.prenom),
                eq(officials.birthDate, sen.date_naissance),
                isNull(officials.senatId),
              ),
            )
            .limit(1)
        : [];

      if (anMatch.length > 0) {
        officialId = anMatch[0].id;
        await db
          .update(officials)
          .set({
            senatId: sen.matricule,
            photoUrl: sen.photo_url ?? anMatch[0].photoUrl,
            full: sen.full,
            updatedAt: new Date(),
          })
          .where(eq(officials.id, officialId));
        summary.merged++;
      } else {
        const [inserted] = await db
          .insert(officials)
          .values({
            firstName: sen.prenom,
            lastName: sen.nom,
            senatId: sen.matricule,
            birthDate: sen.date_naissance,
            photoUrl: sen.photo_url,
            slug,
            full: sen.full,
          })
          .returning();
        officialId = inserted!.id;
        summary.officials++;
      }
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
            updatedAt: new Date(),
          })
          .where(eq(mandates.id, existingMandat[0].id));
      }
    }
  }

  logger.info(
    `Senators: ${summary.officials} new officials, ${summary.mandates} new mandates, ${summary.merged} merged with AN`,
  );
  return summary;
}
