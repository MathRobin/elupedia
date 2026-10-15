import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { Depute } from '../sources/assemblee-nationale.js';
import { writeProvenance } from './provenance.js';
import { matchMandate } from './mandate-match.js';
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
        .select({ id: officials.id, slug: officials.slug })
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
              .select({
                id: officials.id,
                slug: officials.slug,
                photoUrl: officials.photoUrl,
              })
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

      // Tous les mandats connus de l'élu, une seule requête ; le rapprochement
      // mandat par mandat est fait en mémoire (voir mandate-match.ts).
      const existingMandates = await db
        .select({
          id: mandates.id,
          type: mandates.type,
          startDate: mandates.startDate,
          endDate: mandates.endDate,
          department: mandates.department,
        })
        .from(mandates)
        .where(eq(mandates.officialId, officialId));

      for (const m of depute.allMandates) {
        const { target, endDate } = matchMandate(existingMandates, m);

        // Le mandat sénateur en cours peut aussi provenir de senators.ts (open
        // data Sénat, toujours renseigné en département) : ne pas écraser un
        // département déjà connu par une valeur vide quand cette source (AN)
        // n'a pas l'info pour ce mandat.
        const department = m.nom_circo || target?.department || null;

        const district =
          m.type === 'senateur' || m.num_circo === 0
            ? null
            : `${m.num_circo}e circonscription`;

        if (!target) {
          const [inserted] = await db
            .insert(mandates)
            .values({
              officialId,
              type: m.type,
              district,
              department,
              startDate: m.mandat_debut,
              endDate,
              politicalGroup: m.groupe_sigle ?? null,
            })
            .returning({ id: mandates.id });
          existingMandates.push({
            id: inserted!.id,
            type: m.type,
            startDate: m.mandat_debut,
            endDate,
            department,
          });
        } else {
          await db
            .update(mandates)
            .set({
              district,
              department,
              startDate: m.mandat_debut,
              endDate,
              politicalGroup: m.groupe_sigle ?? null,
              updatedAt: new Date(),
            })
            .where(eq(mandates.id, target.id));
          target.startDate = m.mandat_debut;
          target.endDate = endDate;
          target.department = department;
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
