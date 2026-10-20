/**
 * Upsert des membres des assemblées à statut particulier (Corse, Guyane,
 * Martinique, Polynésie, Nouvelle-Calédonie, Métropole de Lyon...) à partir
 * du RNE (`sources/rne-membres-assemblee.ts`), appelé par le script
 * `ingest:membres-assemblee`.
 *
 * Tables écrites : `officials` (création seulement) et `mandates` (type
 * `membre_assemblee_statut_particulier`).
 *
 * Clés de rapprochement :
 * - official : prénom + nom (insensible à la casse) + date de naissance ;
 * - mandat : official + type + `district` (cf. `territory`) + mandat actif.
 *
 * Idempotent. Les mandats actifs absents du fichier sont clos à la date du
 * jour ; une prise de fonction plus récente est historisée (clôture + nouvelle
 * ligne). Les fiches `officials` existantes ne sont jamais modifiées.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates, normalizePersonName } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { RneMembreAssemblee } from '../sources/rne-membres-assemblee.js';
import { logger } from '../logger.js';
import {
  applyOfficialAliases,
  loadOfficialAliases,
} from './official-aliases.js';

const MANDATE_TYPE = 'membre_assemblee_statut_particulier' as const;

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

// La plupart des collectivités à statut particulier (Corse, Guyane,
// Martinique, Polynésie française, Nouvelle-Calédonie...) forment une
// assemblée unique sans subdivision : `department` = `district` = le nom de
// la collectivité (déjà reconnu comme "département" ailleurs sur le site,
// cf. DEPARTMENT_CODES). Seule la Métropole de Lyon a de vraies
// circonscriptions internes : `department` = "Rhône", `district` = le nom de
// la circonscription.
function territory(membre: RneMembreAssemblee): {
  district: string;
  department: string;
} {
  if (membre.circonscriptionName) {
    return {
      district: membre.circonscriptionName,
      department: membre.departmentName,
    };
  }
  return {
    district: membre.collectiviteName,
    department: membre.collectiviteName,
  };
}

function territoryKey(department: string, district: string): string {
  return `${department}|${district}`;
}

/** Clé de rapprochement d'un official : prénom|nom (minuscules)|naissance. */
function officialKey(
  firstName: string,
  lastName: string,
  birthDate: string | null,
): string {
  return `${normalizePersonName(firstName)}|${normalizePersonName(lastName)}|${birthDate ?? ''}`;
}

/**
 * Crée les officials inconnus et rattache chaque ligne RNE à un `official_id`.
 * Retourne aussi le nombre d'officials créés (effet de bord : INSERT).
 */
async function resolveOfficials(
  db: NeonHttpDatabase,
  membres: RneMembreAssemblee[],
): Promise<{
  resolved: Array<{ row: RneMembreAssemblee; officialId: string }>;
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
  // Identités alternatives (fusions de doublons, corrections) : la clé source
  // redirige vers la fiche cible au lieu de recréer une fiche.
  applyOfficialAliases(officialByKey, await loadOfficialAliases(db), (id) => {
    const o = allOfficials.find((x) => x.id === id);
    return o ? { id: o.id, slug: o.slug } : undefined;
  });

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

  const resolved: Array<{ row: RneMembreAssemblee; officialId: string }> = [];
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
 * Upsert des membres d'assemblées à statut particulier : crée les officials
 * manquants, clôt les mandats actifs disparus du fichier, puis insère / met à
 * jour / historise chaque mandat. Écrit dans `officials` et `mandates`.
 * Retourne des compteurs.
 */
export async function upsertMembresAssemblee(
  db: NeonHttpDatabase,
  membres: RneMembreAssemblee[],
) {
  const summary = {
    officials: 0,
    mandates: 0,
    ended: 0,
    replaced: 0,
    skipped: 0,
  };

  // Comme pour les autres mandats locaux à N titulaires (régionaux,
  // arrondissement), on résout d'abord tous les officials, puis on ferme les
  // mandats dont le titulaire n'apparaît plus dans le fichier RNE pour son
  // territoire.
  const { resolved, created } = await resolveOfficials(db, membres);
  summary.officials = created;

  const currentPairs = new Set(
    resolved.map(({ row, officialId }) => {
      const { department, district } = territory(row);
      return `${territoryKey(department, district)}|${officialId}`;
    }),
  );

  const activeMandates = await db
    .select({
      id: mandates.id,
      officialId: mandates.officialId,
      district: mandates.district,
      department: mandates.department,
    })
    .from(mandates)
    .where(and(eq(mandates.type, MANDATE_TYPE), isNull(mandates.endDate)));

  const today = new Date().toISOString().split('T')[0];

  for (const active of activeMandates) {
    const pair = `${territoryKey(active.department ?? '', active.district ?? '')}|${active.officialId}`;
    if (!currentPairs.has(pair)) {
      await db
        .update(mandates)
        .set({ endDate: today, updatedAt: new Date() })
        .where(eq(mandates.id, active.id));
      summary.ended++;
    }
  }

  for (const { row: membre, officialId } of resolved) {
    const { district, department } = territory(membre);

    const existingMandate = await db
      .select({ id: mandates.id, startDate: mandates.startDate })
      .from(mandates)
      .where(
        and(
          eq(mandates.officialId, officialId),
          eq(mandates.type, MANDATE_TYPE),
          eq(mandates.district, district),
          isNull(mandates.endDate),
        ),
      )
      .limit(1);
    const current = existingMandate[0];

    // functionStartDate (prise de fonction de CET élu) plutôt que
    // mandateStartDate (élection de l'assemblée, inchangée lors d'un
    // remplacement en cours de mandat) : sinon un remplacement se voit
    // attribuer la date de début du prédécesseur.
    const newStartDate = membre.functionStartDate || membre.mandateStartDate;

    if (!newStartDate) {
      logger.warn(
        `  Skipping mandate for ${membre.firstName} ${membre.lastName} (${district}): ` +
          `no mandate/function start date in source data`,
      );
      summary.skipped++;
      continue;
    }

    const mandateValues = {
      officialId,
      type: MANDATE_TYPE,
      district,
      department,
      startDate: newStartDate,
    };

    // Une date de prise de fonction postérieure à celle du mandat actif
    // signale un remplacement : on clôt l'ancien mandat et on en ouvre un
    // nouveau plutôt que d'écraser la ligne existante, pour ne pas perdre
    // l'historique. Une date antérieure est une simple correction de la
    // période en cours : on met à jour la ligne existante sans l'historiser.
    const isReplacement = !!current && newStartDate > current.startDate;

    // L'index unique (official_id, type, start_date) peut refuser l'écriture
    // quand un homonyme (même nom + naissance) a déjà un mandat de ce type à
    // cette date ailleurs : on saute la ligne au lieu d'interrompre l'ingestion.
    const uniqueViolationMessage = (action: string) =>
      `  Skipping mandate${action} for ${membre.firstName} ${membre.lastName} (${district}): ` +
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
            department,
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
    `Membres assemblée statut particulier: ${summary.officials} officials created, ${summary.mandates} mandates upserted, ${summary.ended} mandates ended, ${summary.replaced} replacements historized`,
  );
  return summary;
}
