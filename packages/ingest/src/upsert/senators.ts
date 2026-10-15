/**
 * Upsert des sénateurs et de leurs mandats sénatoriaux à partir de l'open
 * data du Sénat (`sources/senat.ts`), appelé par `run-senat.ts`
 * (`ingest:senat`). Pendant Sénat de `upsert/officials.ts`.
 *
 * Tables écrites : `officials` et `mandates` (type `senateur`). Pas de
 * provenance ici.
 *
 * Clés de rapprochement :
 * - official : `senat_id` (matricule) ; sinon nom + prénom + date de naissance
 *   parmi les officials sans `senat_id` (fiche AN d'un ex-député) ; en dernier
 *   recours l'official portant exactement le slug calculé (voir
 *   `isSlugUniqueViolation`). Dans les deux cas la fiche est rattachée
 *   (`merged`), pas dupliquée ;
 * - mandat : mandat actif du même type si la source ne donne pas de fin,
 *   sinon official + type + date de début.
 *
 * Idempotent. Jamais écrasés : le `slug` existant et la `photo_url` AN quand
 * le Sénat n'en a pas. Attention : nom, prénom et date de naissance d'une
 * fiche déjà rattachée par matricule SONT réécrits par le Sénat.
 * Résilience : retry court par sénateur, puis arrêt propre (sans throw)
 * après MAX_CONSECUTIVE_FAILURES échecs.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { Senateur } from '../sources/senat.js';
import { logger } from '../logger.js';
import { withRetry, describeError } from '../utils/retry.js';

// Même famille d'incident que upsert/senat-parliamentary-activity.ts
// (driver Neon HTTP sans connexion persistante, un blip réseau isolé sur un
// sénateur faisait auparavant échouer tout le run et le rejouer depuis le
// début via runStep — constaté en conditions réelles le 01/10/2026).
const MAX_CONSECUTIVE_FAILURES = 5;

function slugify(firstName: string, lastName: string): string {
  return `${firstName}-${lastName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Code SQLSTATE Postgres d'une violation de contrainte d'unicité. */
const PG_UNIQUE_VIOLATION = '23505';
/** Nom de la contrainte unique sur `officials.slug` (cf. migrations). */
const SLUG_UNIQUE_CONSTRAINT = 'officials_slug_unique';

// Constaté en conditions réelles le 04/10/2026 : l'insertion d'un nouveau
// sénateur peut heurter la contrainte unique sur `officials.slug` quand le
// rapprochement AN ci-dessus (nom + prénom + date de naissance exacts) ne
// trouve pas la personne alors qu'un official du même nom existe déjà (ex.
// ancien·ne député·e devenu·e sénateur·rice, avec une date de naissance
// enregistrée différemment selon la source). Plutôt que d'abandonner ce
// sénateur à chaque run (le conflit est déterministe, pas un blip réseau :
// le retry ci-dessous ne le résorbe jamais), on se rabat sur l'official
// existant portant exactement ce slug et on le rattache comme pour un
// rapprochement AN classique.
function isSlugUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const err = error as {
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  if (err.code === PG_UNIQUE_VIOLATION) {
    if (err.constraint === SLUG_UNIQUE_CONSTRAINT) return true;
    // Selon la couche qui enveloppe l'erreur, le nom de la contrainte n'est
    // parfois présent que dans le message.
    if (
      typeof err.message === 'string' &&
      err.message.includes(SLUG_UNIQUE_CONSTRAINT)
    )
      return true;
  }
  if ('cause' in err) return isSlugUniqueViolation(err.cause);
  return false;
}

/**
 * Upsert d'un sénateur : fiche `officials` (par matricule, rapprochement AN,
 * repli sur slug, sinon création) puis chacun de ses mandats.
 */
async function processSenateurRecord(
  db: NeonHttpDatabase,
  senateur: Senateur,
  summary: { officials: number; mandates: number; merged: number },
): Promise<void> {
  const existing = await db
    .select({ id: officials.id, slug: officials.slug })
    .from(officials)
    .where(eq(officials.senatId, senateur.matricule))
    .limit(1);

  let officialId: string;

  const slug = slugify(senateur.prenom, senateur.nom);

  if (existing.length > 0) {
    officialId = existing[0].id;
    await db
      .update(officials)
      .set({
        firstName: senateur.prenom,
        lastName: senateur.nom,
        birthDate: senateur.date_naissance,
        photoUrl: senateur.photo_url,
        slug: existing[0].slug ?? slug,
        full: senateur.full,
        updatedAt: new Date(),
      })
      .where(eq(officials.id, officialId));
  } else {
    // Fiche déjà créée par l'ingestion AN (sans senat_id) pour la même
    // personne : on la rattache au lieu d'en créer une deuxième.
    const anMatch = senateur.date_naissance
      ? await db
          .select({ id: officials.id, photoUrl: officials.photoUrl })
          .from(officials)
          .where(
            and(
              eq(officials.lastName, senateur.nom),
              eq(officials.firstName, senateur.prenom),
              eq(officials.birthDate, senateur.date_naissance),
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
          senatId: senateur.matricule,
          photoUrl: senateur.photo_url ?? anMatch[0].photoUrl,
          full: senateur.full,
          updatedAt: new Date(),
        })
        .where(eq(officials.id, officialId));
      summary.merged++;
    } else {
      try {
        const [inserted] = await db
          .insert(officials)
          .values({
            firstName: senateur.prenom,
            lastName: senateur.nom,
            senatId: senateur.matricule,
            birthDate: senateur.date_naissance,
            photoUrl: senateur.photo_url,
            slug,
            full: senateur.full,
          })
          .returning();
        officialId = inserted!.id;
        summary.officials++;
      } catch (error) {
        if (!isSlugUniqueViolation(error)) throw error;

        // Repli décrit au-dessus de isSlugUniqueViolation : l'official qui
        // porte déjà ce slug est très probablement la même personne.
        const bySlug = await db
          .select({ id: officials.id, photoUrl: officials.photoUrl })
          .from(officials)
          .where(eq(officials.slug, slug))
          .limit(1);
        if (bySlug.length === 0) throw error;

        officialId = bySlug[0].id;
        await db
          .update(officials)
          .set({
            senatId: senateur.matricule,
            photoUrl: senateur.photo_url ?? bySlug[0].photoUrl,
            full: senateur.full,
            updatedAt: new Date(),
          })
          .where(eq(officials.id, officialId));
        summary.merged++;
      }
    }
  }

  for (const mandat of senateur.mandats) {
    const mandateColumns = { id: mandates.id, endDate: mandates.endDate };

    // 1) Même mandat identifié par sa date de début exacte. Toujours tenté
    // en premier : l'index unique (official_id, type, start_date) interdit de
    // déplacer la date de début du mandat actif sur une date déjà occupée.
    // Cas réel après les sénatoriales 2026 : senat-mandats-2026 a clos le
    // mandat 2020 → 2026 et ouvert le nouveau, alors qu'ODSEN_ELUSEN publie
    // encore le mandat 2020 sans date de fin.
    let existingMandat = await db
      .select(mandateColumns)
      .from(mandates)
      .where(
        and(
          eq(mandates.officialId, officialId),
          eq(mandates.type, 'senateur'),
          eq(mandates.startDate, mandat.start_date),
        ),
      )
      .limit(1);

    // 2) Sinon, un mandat en cours (end_date absente) est identifié par son
    // statut actif : la date de début de la source peut n'être que
    // provisoire (mandat synthétique de fetchSenateurs) ou différer de celle
    // posée par une autre source (AN, senat-mandats-2026), et on ne veut pas
    // dupliquer le mandat quand la vraie date arrive ensuite.
    if (existingMandat.length === 0 && mandat.end_date === null) {
      existingMandat = await db
        .select(mandateColumns)
        .from(mandates)
        .where(
          and(
            eq(mandates.officialId, officialId),
            eq(mandates.type, 'senateur'),
            isNull(mandates.endDate),
          ),
        )
        .limit(1);
    }

    if (existingMandat.length === 0) {
      await db.insert(mandates).values({
        officialId,
        type: 'senateur',
        department: mandat.department,
        startDate: mandat.start_date,
        endDate: mandat.end_date,
      });
      summary.mandates++;
    } else {
      await db
        .update(mandates)
        .set({
          department: mandat.department,
          // Une date provisoire (mandat synthétique) n'écrase jamais une date
          // de début déjà en base, qui vient d'une source plus précise
          // (senat-mandats-2026 : 1er octobre suivant le scrutin). Cas réel :
          // les élus de 2026 se retrouvaient datés du renouvellement de 2023.
          ...(mandat.synthetic ? {} : { startDate: mandat.start_date }),
          // Une date de fin déjà connue (posée par une source plus à jour,
          // ex. résultats des sénatoriales) n'est pas effacée par une absence
          // d'info côté ELUSEN : sinon on rouvrirait un mandat clos et la
          // personne aurait deux mandats sénateur actifs.
          endDate: mandat.end_date ?? existingMandat[0].endDate ?? null,
          updatedAt: new Date(),
        })
        .where(eq(mandates.id, existingMandat[0].id));
    }
  }
}

/**
 * Upsert de chaque sénateur. Écrit dans `officials` et `mandates`. Retourne
 * le nombre d'officials créés, de mandats créés et de fiches rattachées à
 * une fiche AN. Ne lève jamais pour un échec DB : s'arrête proprement après
 * trop d'échecs consécutifs.
 */
export async function upsertSenators(
  db: NeonHttpDatabase,
  senateurs: Senateur[],
) {
  const summary = { officials: 0, mandates: 0, merged: 0 };

  let consecutiveFailures = 0;
  let stoppedEarly = false;

  for (const senateur of senateurs) {
    try {
      // 2 essais absorbent un blip réseau isolé (driver Neon HTTP, pas de
      // connexion persistante) sans attendre le withRetry de runStep, qui
      // rejouerait sinon tout le run depuis le premier sénateur.
      await withRetry(() => processSenateurRecord(db, senateur, summary), {
        source: `senateurs ${senateur.matricule}`,
        maxAttempts: 2,
        baseDelayMs: 500,
      });
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures++;
      logger.warn(
        `  Failed processing sénateur ${senateur.matricule} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}) : ${describeError(error)}`,
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.warn(
          `  ${MAX_CONSECUTIVE_FAILURES} échecs consécutifs, arrêt du run — probable panne côté base de données`,
        );
        stoppedEarly = true;
        break;
      }
    }
  }

  logger.info(
    `Senators: ${summary.officials} new officials, ${summary.mandates} new mandates, ${summary.merged} merged with AN` +
      (stoppedEarly ? ' — arrêt anticipé (voir logs ci-dessus)' : ''),
  );
  return summary;
}
