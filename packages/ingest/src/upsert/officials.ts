/**
 * Upsert des députés (et de leurs mandats passés, y compris sénatoriaux) à
 * partir de l'open data de l'Assemblée nationale
 * (`sources/assemblee-nationale.ts`), appelé par `run-an.ts` (`ingest:an`).
 *
 * Tables écrites : `officials`, `mandates` et `data_provenance`.
 *
 * Clés de rapprochement :
 * - official : `an_id` ; sinon nom + prénom + date de naissance parmi les
 *   officials sans `an_id` (fiche créée par le Sénat, cf. `upsert/senators.ts`),
 *   auquel cas la fiche est rattachée plutôt que dupliquée ;
 * - mandat : official + type + date de début, puis, pour un mandat en cours,
 *   le mandat actif du même type (voir les commentaires dans la boucle).
 *
 * Idempotent. Jamais écrasés : le `slug` existant (URLs publiques), la
 * `photo_url` Sénat quand l'AN n'en a pas, le `department` d'un mandat déjà
 * connu, et une `end_date` posée par une source plus à jour.
 * Une erreur sur un député interrompt tout le lot (throw).
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { Depute } from '../sources/assemblee-nationale.js';
import { writeProvenance } from './provenance.js';
import { logger } from '../logger.js';

/** Un log d'avancement tous les N députés. */
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

/**
 * Upsert de chaque député : fiche `officials`, tous ses mandats, provenance.
 * Retourne `{ officialId, anId }` par député traité. Lève à la première
 * erreur après l'avoir loguée avec sa cause Postgres.
 */
export async function upsertOfficials(db: NeonHttpDatabase, deputes: Depute[]) {
  const results = [];

  const allSlugs = await db.select({ slug: officials.slug }).from(officials);
  const takenSlugs = new Set(
    allSlugs.filter((o) => o.slug).map((o) => o.slug!),
  );

  /** Suffixe `-1`, `-2`... si le slug de base est déjà pris (homonymes). */
  function uniqueSlug(base: string): string {
    if (!takenSlugs.has(base)) {
      takenSlugs.add(base);
      return base;
    }
    let suffix = 1;
    while (takenSlugs.has(`${base}-${suffix}`)) suffix++;
    const candidate = `${base}-${suffix}`;
    takenSlugs.add(candidate);
    return candidate;
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
        // Fiche déjà créée par l'ingestion Sénat (sans an_id) pour la même
        // personne : on la rattache au lieu d'en créer une deuxième.
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

      for (const m of depute.allMandates) {
        const mandateColumns = {
          id: mandates.id,
          department: mandates.department,
          endDate: mandates.endDate,
        };

        // 1) Même mandat identifié par sa date de début. Toujours tenté en
        // premier, y compris pour un mandat « en cours » côté AN : l'index
        // unique (official_id, type, start_date) interdit de déplacer la date
        // de début du mandat actif sur une date déjà occupée par un autre
        // mandat. Cas réel : après les sénatoriales 2026, le Sénat a clos le
        // mandat 2023 → 2026 et ouvert le nouveau, alors que l'AN republie
        // encore le mandat 2023 sans date de fin.
        let existingMandate = await db
          .select(mandateColumns)
          .from(mandates)
          .where(
            and(
              eq(mandates.officialId, officialId),
              eq(mandates.type, m.type),
              eq(mandates.startDate, m.mandat_debut),
            ),
          )
          .limit(1);

        // 2) Sinon, un mandat en cours (pas de mandat_fin) est identifié par
        // son statut actif : cette source (AN) et celle du Sénat (cf.
        // upsert/senators.ts) peuvent publier des dates de début légèrement
        // différentes pour le même mandat sénatorial en cours, ce qui créait
        // un mandat en double au lieu de le mettre à jour.
        if (existingMandate.length === 0 && !m.mandat_fin) {
          existingMandate = await db
            .select(mandateColumns)
            .from(mandates)
            .where(
              and(
                eq(mandates.officialId, officialId),
                eq(mandates.type, m.type),
                isNull(mandates.endDate),
              ),
            )
            .limit(1);
        }

        // Le mandat sénateur en cours peut aussi provenir de senators.ts (open
        // data Sénat, toujours renseigné en département) : ne pas écraser un
        // département déjà connu par une valeur vide quand cette source (AN)
        // n'a pas l'info pour ce mandat.
        const department =
          m.nom_circo || existingMandate[0]?.department || null;

        // Pas de circonscription numérotée pour un sénateur ; num_circo = 0
        // signifie « inconnu » côté AN.
        const district =
          m.type === 'senateur' || m.num_circo === 0
            ? null
            : `${m.num_circo}e circonscription`;

        if (existingMandate.length === 0) {
          await db.insert(mandates).values({
            officialId,
            type: m.type,
            district,
            department,
            startDate: m.mandat_debut,
            endDate: m.mandat_fin ?? null,
            politicalGroup: m.groupe_sigle ?? null,
          });
        } else {
          await db
            .update(mandates)
            .set({
              district,
              department,
              startDate: m.mandat_debut,
              // Une date de fin déjà connue (posée par une source plus à jour,
              // ex. résultats des sénatoriales) n'est pas effacée par une
              // absence d'info côté AN.
              endDate: m.mandat_fin ?? existingMandate[0].endDate ?? null,
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
      // Drizzle enveloppe l'erreur Postgres : la vraie cause (violation
      // d'unicité, etc.) est dans error.cause, jamais imprimée sinon.
      const cause = (error as { cause?: unknown })?.cause;
      if (cause) {
        logger.error(
          `  Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
      throw error;
    }
  }

  logger.info(`Officials: ${results.length} deputes processed`);
  return results;
}
