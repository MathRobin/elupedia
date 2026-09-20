import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { Depute } from '../sources/assemblee-nationale.js';
import { writeProvenance } from './provenance.js';
import { logger } from '../logger.js';

const LOG_CHUNK_SIZE = 50;

function slugify(firstName: string, lastName: string): string {
  return `${firstName}-${lastName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const SOURCE_NAME = 'Assemblée nationale - Open Data';
const LEGAL_BASIS =
  'Données publiques de mandat parlementaire (art. L311-1 CRPA)';

export async function upsertOfficials(db: NeonHttpDatabase, deputes: Depute[]) {
  const results = [];

  const allSlugs = await db.select({ slug: officials.slug }).from(officials);
  const slugSet = new Set(allSlugs.filter((o) => o.slug).map((o) => o.slug!));

  function uniqueSlug(base: string): string {
    if (!slugSet.has(base)) {
      slugSet.add(base);
      return base;
    }
    let i = 1;
    while (slugSet.has(`${base}-${i}`)) i++;
    const s = `${base}-${i}`;
    slugSet.add(s);
    return s;
  }

  for (let i = 0; i < deputes.length; i++) {
    const depute = deputes[i];
    const anId = depute.id_an;

    if (i % LOG_CHUNK_SIZE === 0) {
      logger.info(`  [${i + 1}/${deputes.length}] traitement des officials...`);
    }

    try {
      const existing = await db
        .select()
        .from(officials)
        .where(eq(officials.anId, anId))
        .limit(1);

      let officialId: string;

      const computeSlug = () => uniqueSlug(slugify(depute.prenom, depute.nom));

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
            slug: existing[0].slug ?? computeSlug(),
            full: depute.full,
            updatedAt: new Date(),
          })
          .where(eq(officials.id, officialId));
      } else {
        const senatMatch = depute.date_naissance
          ? await db
              .select()
              .from(officials)
              .where(
                and(
                  eq(officials.lastName, depute.nom),
                  eq(officials.firstName, depute.prenom),
                  eq(officials.birthDate, depute.date_naissance),
                  isNull(officials.anId),
                ),
              )
              .limit(1)
          : [];

        if (senatMatch.length > 0) {
          officialId = senatMatch[0].id;
          await db
            .update(officials)
            .set({
              anId,
              firstName: depute.prenom,
              lastName: depute.nom,
              birthDate: depute.date_naissance,
              photoUrl: depute.photo_url ?? senatMatch[0].photoUrl,
              deathDate: depute.death_date ?? null,
              slug: senatMatch[0].slug ?? computeSlug(),
              full: depute.full,
              updatedAt: new Date(),
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
              slug: computeSlug(),
              full: depute.full,
            })
            .returning();
          officialId = inserted!.id;
        }
      }

      for (const m of depute.allMandates) {
        const existingMandate = await db
          .select({ id: mandates.id })
          .from(mandates)
          .where(
            and(
              eq(mandates.officialId, officialId),
              eq(mandates.type, m.type),
              eq(mandates.startDate, m.mandat_debut),
            ),
          )
          .limit(1);

        const district =
          m.type === 'senateur' || m.num_circo === 0
            ? null
            : `${m.num_circo}e circonscription`;

        if (existingMandate.length === 0) {
          await db.insert(mandates).values({
            officialId,
            type: m.type,
            district,
            department: m.nom_circo,
            startDate: m.mandat_debut,
            endDate: m.mandat_fin ?? null,
            politicalGroup: m.groupe_sigle ?? null,
          });
        } else {
          await db
            .update(mandates)
            .set({
              district,
              department: m.nom_circo,
              endDate: m.mandat_fin ?? null,
              politicalGroup: m.groupe_sigle ?? null,
              updatedAt: new Date(),
            })
            .where(eq(mandates.id, existingMandate[0].id));
        }
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
    } catch (error) {
      logger.error(
        `  Failed processing depute ${anId} (${depute.prenom} ${depute.nom}): ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  logger.info(`Officials: ${results.length} deputes processed`);
  return results;
}
