/**
 * Upsert des membres de l'Assemblée des Français de l'étranger (AFE) à partir
 * du RNE (`sources/rne-membres-afe.ts`), appelé par le script
 * `ingest:membres-afe`.
 *
 * Tables écrites : `officials` (création seulement, jamais de mise à jour) et
 * `mandates` (type `membre_afe`).
 *
 * Clés de rapprochement :
 * - official : prénom + nom (insensible à la casse) + date de naissance ;
 * - mandat : official + type + circonscription AFE (`district`) + mandat actif
 *   (`end_date IS NULL`).
 *
 * Idempotent : rejouer le même fichier ne crée ni official ni mandat en double.
 * Les mandats actifs absents du fichier sont clos à la date du jour ; un mandat
 * dont la date de début avance est historisé (clôture + nouvelle ligne) plutôt
 * qu'écrasé. Les fiches `officials` existantes ne sont jamais modifiées : le RNE
 * n'apporte rien de plus fiable que les sources parlementaires.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { RneMembreAfe } from '../sources/rne-membres-afe.js';
import { logger } from '../logger.js';

// Pas de département français pour ces élus : même constante que pour les
// conseillers des Français de l'étranger (conseillers-fde) et les
// eurodéputés de cette circonscription, pour rester cohérent. La
// circonscription AFE (zone géographique large, ex. "Canada") va dans
// `district`.
const DEPARTMENT_LABEL = 'Français établis hors de France';

const MANDATE_TYPE = 'membre_afe' as const;

/** Code SQLSTATE Postgres d'une violation de contrainte d'unicité. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Détecte une violation d'unicité Postgres, y compris quand Drizzle
 * l'enveloppe dans `error.cause`.
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if (
    'code' in error &&
    (error as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  ) {
    return true;
  }
  if ('cause' in error) {
    return isUniqueViolation((error as { cause?: unknown }).cause);
  }
  return false;
}

function slugify(firstName: string, lastName: string): string {
  return `${firstName}-${lastName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Clé de rapprochement d'un official : prénom|nom (minuscules)|naissance. */
function officialKey(
  firstName: string,
  lastName: string,
  birthDate: string | null,
): string {
  return `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${birthDate ?? ''}`;
}

/**
 * Crée les officials inconnus et rattache chaque ligne RNE à un `official_id`.
 * Retourne aussi un compteur des officials créés (effet de bord : INSERT).
 */
async function resolveOfficials(
  db: NeonHttpDatabase,
  membres: RneMembreAfe[],
): Promise<{
  resolved: Array<{ row: RneMembreAfe; officialId: string }>;
  created: number;
}> {
  const allOfficials = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      birthDate: officials.birthDate,
      slug: officials.slug,
    })
    .from(officials);

  const officialByKey = new Map<string, { id: string; slug: string | null }>();
  for (const official of allOfficials) {
    officialByKey.set(
      officialKey(official.firstName, official.lastName, official.birthDate),
      { id: official.id, slug: official.slug },
    );
  }

  const takenSlugs = new Set(
    allOfficials.filter((o) => o.slug).map((o) => o.slug!),
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

  const resolved: Array<{ row: RneMembreAfe; officialId: string }> = [];
  let created = 0;
  for (const membre of membres) {
    const key = officialKey(
      membre.firstName,
      membre.lastName,
      membre.birthDate,
    );
    let official = officialByKey.get(key);

    if (!official) {
      const slug = uniqueSlug(slugify(membre.firstName, membre.lastName));
      const [inserted] = await db
        .insert(officials)
        .values({
          firstName: membre.firstName,
          lastName: membre.lastName,
          birthDate: membre.birthDate,
          slug,
        })
        .returning({ id: officials.id });
      official = { id: inserted!.id, slug };
      officialByKey.set(key, official);
      created++;
    }

    resolved.push({ row: membre, officialId: official.id });
  }

  return { resolved, created };
}

/**
 * Upsert des membres AFE : crée les officials manquants, clôt les mandats
 * actifs disparus du fichier, puis insère / met à jour / historise chaque
 * mandat. Écrit dans `officials` et `mandates`. Retourne des compteurs.
 */
export async function upsertMembresAfe(
  db: NeonHttpDatabase,
  membres: RneMembreAfe[],
) {
  const summary = {
    officials: 0,
    mandates: 0,
    ended: 0,
    replaced: 0,
    skipped: 0,
  };

  // Chaque circonscription AFE compte plusieurs membres (élection au second
  // degré, par et parmi les conseillers consulaires) : comme pour les autres
  // mandats locaux à N titulaires, on résout d'abord tous les officials, puis
  // on ferme les mandats dont le titulaire n'apparaît plus dans le fichier
  // RNE pour sa circonscription.
  const { resolved, created } = await resolveOfficials(db, membres);
  summary.officials = created;

  const currentPairs = new Set(
    resolved.map(({ row, officialId }) => `${row.afeName}|${officialId}`),
  );

  const activeMandates = await db
    .select({
      id: mandates.id,
      officialId: mandates.officialId,
      district: mandates.district,
    })
    .from(mandates)
    .where(and(eq(mandates.type, MANDATE_TYPE), isNull(mandates.endDate)));

  const today = new Date().toISOString().split('T')[0];

  for (const active of activeMandates) {
    const pair = `${active.district ?? ''}|${active.officialId}`;
    if (!currentPairs.has(pair)) {
      await db
        .update(mandates)
        .set({ endDate: today, updatedAt: new Date() })
        .where(eq(mandates.id, active.id));
      summary.ended++;
    }
  }

  for (const { row: membre, officialId } of resolved) {
    const existingMandate = await db
      .select({ id: mandates.id, startDate: mandates.startDate })
      .from(mandates)
      .where(
        and(
          eq(mandates.officialId, officialId),
          eq(mandates.type, MANDATE_TYPE),
          eq(mandates.district, membre.afeName),
          isNull(mandates.endDate),
        ),
      )
      .limit(1);
    const current = existingMandate[0];

    const newStartDate = membre.mandateStartDate;

    if (!newStartDate) {
      logger.warn(
        `  Skipping mandate for ${membre.firstName} ${membre.lastName} (${membre.afeName}): ` +
          `no mandate start date in source data`,
      );
      summary.skipped++;
      continue;
    }

    const mandateValues = {
      officialId,
      type: MANDATE_TYPE,
      district: membre.afeName,
      department: DEPARTMENT_LABEL,
      startDate: newStartDate,
    };

    // Une date de début postérieure à celle du mandat actif signale un
    // remplacement : on clôt l'ancien mandat et on en ouvre un nouveau
    // plutôt que d'écraser la ligne existante, pour ne pas perdre
    // l'historique. Une date antérieure est une simple correction de la
    // période en cours : on met à jour la ligne existante sans l'historiser.
    const isReplacement = !!current && newStartDate > current.startDate;

    // L'index unique (official_id, type, start_date) peut refuser l'écriture
    // quand un homonyme (même nom + naissance) a déjà un mandat AFE à cette
    // date ailleurs : on saute la ligne au lieu d'interrompre l'ingestion.
    const uniqueViolationMessage = (action: string) =>
      `  Skipping mandate${action} for ${membre.firstName} ${membre.lastName} (${membre.afeName}): ` +
      `official already has a "${MANDATE_TYPE}" mandate starting on the same date elsewhere — likely a homonym or bad source data`;

    if (!current) {
      try {
        await db.insert(mandates).values(mandateValues);
        summary.mandates++;
      } catch (error) {
        if (isUniqueViolation(error)) {
          logger.warn(uniqueViolationMessage(''));
          summary.skipped++;
        } else {
          throw error;
        }
      }
    } else if (isReplacement) {
      try {
        // Clôture et ouverture dans le même batch (transaction unique côté
        // Neon) : si l'insertion échoue, la clôture est annulée avec elle.
        await db.batch([
          db
            .update(mandates)
            .set({ endDate: newStartDate, updatedAt: new Date() })
            .where(eq(mandates.id, current.id)),
          db.insert(mandates).values(mandateValues),
        ]);
        summary.mandates++;
        summary.replaced++;
      } catch (error) {
        if (isUniqueViolation(error)) {
          logger.warn(uniqueViolationMessage(''));
          summary.skipped++;
        } else {
          throw error;
        }
      }
    } else {
      try {
        await db
          .update(mandates)
          .set({
            startDate: newStartDate,
            endDate: null,
            updatedAt: new Date(),
          })
          .where(eq(mandates.id, current.id));
        summary.mandates++;
      } catch (error) {
        if (isUniqueViolation(error)) {
          logger.warn(uniqueViolationMessage(' update'));
          summary.skipped++;
        } else {
          throw error;
        }
      }
    }
  }

  logger.info(
    `Membres de l'Assemblée des Français de l'étranger: ${summary.officials} officials created, ${summary.mandates} mandates upserted, ${summary.ended} mandates ended, ${summary.replaced} replacements historized`,
  );
  return summary;
}
