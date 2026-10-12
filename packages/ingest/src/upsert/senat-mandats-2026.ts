/**
 * Ouverture des mandats des sénateurs élus en septembre 2026 et clôture des
 * mandats sortants, à partir des résultats publiés sur
 * senatoriales2026.senat.fr (`sources/senat-resultats-2026.ts`). Appelé par
 * `run-senat-resultats.ts` (`ingest:senat:resultats`), après
 * `upsert/senat-resultats-2026.ts`.
 *
 * Tables écrites : `officials` (création des nouveaux élus, sans date de
 * naissance ni matricule : l'open data Sénat les complétera ensuite via
 * `upsert/senators.ts`) et `mandates` (type `senateur`).
 *
 * Clés de rapprochement :
 * - official : nom + prénom normalisés (pas de date de naissance dans la
 *   source) — approximatif, homonymes confondus ;
 * - mandat : le mandat sénateur actif de l'official (un seul par personne).
 *
 * Idempotent : un rejeu ne rouvre rien (mandat déjà à MANDATE_START). Un
 * sortant réélu voit son ancien mandat clos et un nouveau ouvert (historique
 * conservé) ; un sortant absent des élus de son département est clos.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates, slugifyText } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { SenatorialResultDepartement } from '../sources/senat-resultats-2026.js';
import { logger } from '../logger.js';

// Date de prise de fonction des sénateurs de la série 1 renouvelée le
// 27 septembre 2026, par analogie avec le fallback '2023-10-01' utilisé
// pour la série précédente (voir sources/senat.ts::fetchSenateurs) : le
// mandat sénatorial commence le 1er octobre suivant le scrutin. Utilisée
// aussi comme date de clôture des mandats sortants (même convention que
// upsert/mayors.ts : la date de début du nouveau mandat clôt l'ancien).
const MANDATE_START = '2026-10-01';

/** Minuscules, sans accents, séparateurs uniformisés : clé de rapprochement. */
function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

// Les noms de famille sont publiés en capitales par senatoriales2026.senat.fr
// (convention "Prénom NOM" des documents électoraux), contrairement au
// reste de la table officials (casse normale, ex. données AN/Sénat). Best
// effort pour éviter des fiches "AMOUROUX" au lieu de "Amouroux" — pas
// garanti pour les particules/apostrophes complexes, à corriger
// manuellement si besoin (ou automatiquement quand data.senat.fr publiera
// ce sénateur avec sa casse officielle).
const LOWERCASE_PARTICLES = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'von',
  'van',
  'der',
]);

function titleCaseLastName(raw: string): string {
  return raw
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === '-' || part === '') return part;
      if (LOWERCASE_PARTICLES.has(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

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

/**
 * Ouvre les mandats 2026 des élus et clôt ceux des sortants, département par
 * département. Écrit dans `officials` et `mandates`. Retourne des compteurs.
 */
export async function upsertSenatMandats2026(
  db: NeonHttpDatabase,
  departements: SenatorialResultDepartement[],
) {
  const summary = {
    officialsCreated: 0,
    mandatesOpened: 0,
    reelected: 0,
    mandatesClosed: 0,
    skipped: 0,
  };

  const allOfficials = await db
    .select({
      id: officials.id,
      firstName: officials.firstName,
      lastName: officials.lastName,
      slug: officials.slug,
    })
    .from(officials);

  const officialByName = new Map<string, { id: string }>();
  for (const official of allOfficials) {
    const key = `${normalize(official.lastName)}|${normalize(official.firstName)}`;
    officialByName.set(key, { id: official.id });
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

  const activeSenateurMandates = await db
    .select({
      id: mandates.id,
      officialId: mandates.officialId,
      department: mandates.department,
      startDate: mandates.startDate,
    })
    .from(mandates)
    .where(and(eq(mandates.type, 'senateur'), isNull(mandates.endDate)));

  // Deux index sur les mandats actifs : par official (pour décider
  // ouverture / réélection) et par département (pour trouver les sortants).
  const activeByOfficial = new Map<
    string,
    { id: string; department: string | null; startDate: string }
  >();
  const activeByDept = new Map<string, { id: string; officialId: string }[]>();
  for (const mandate of activeSenateurMandates) {
    activeByOfficial.set(mandate.officialId, mandate);
    if (mandate.department) {
      const key = normalize(mandate.department);
      const list = activeByDept.get(key) ?? [];
      list.push({ id: mandate.id, officialId: mandate.officialId });
      activeByDept.set(key, list);
    }
  }

  for (const dept of departements) {
    const deptKey = normalize(dept.departementName);
    const reelectedOfficialIds = new Set<string>();

    for (const elu of dept.elus) {
      const nameKey = `${normalize(elu.nom)}|${normalize(elu.prenom)}`;
      let official = officialByName.get(nameKey);

      if (!official) {
        const slug = uniqueSlug(
          slugifyText(`${elu.prenom} ${titleCaseLastName(elu.nom)}`),
        );
        const [inserted] = await db
          .insert(officials)
          .values({
            firstName: elu.prenom,
            lastName: titleCaseLastName(elu.nom),
            slug,
          })
          .returning({ id: officials.id });
        official = { id: inserted!.id };
        officialByName.set(nameKey, official);
        summary.officialsCreated++;
      }

      reelectedOfficialIds.add(official.id);
      const current = activeByOfficial.get(official.id);

      const mandateValues = {
        officialId: official.id,
        type: 'senateur' as const,
        department: dept.departementName,
        startDate: MANDATE_START,
      };

      try {
        if (!current) {
          const [inserted] = await db
            .insert(mandates)
            .values(mandateValues)
            .returning({ id: mandates.id });
          activeByOfficial.set(official.id, {
            id: inserted!.id,
            department: dept.departementName,
            startDate: MANDATE_START,
          });
          summary.mandatesOpened++;
        } else if (current.startDate < MANDATE_START) {
          // Sénateur sortant réélu : clôture de l'ancien mandat (série
          // précédente) et ouverture du nouveau, dans le même batch pour
          // éviter un mandat clos sans remplaçant si l'insertion échoue.
          const [, [inserted]] = await db.batch([
            db
              .update(mandates)
              .set({ endDate: MANDATE_START, updatedAt: new Date() })
              .where(eq(mandates.id, current.id)),
            db.insert(mandates).values(mandateValues).returning({
              id: mandates.id,
            }),
          ]);
          activeByOfficial.set(official.id, {
            id: inserted!.id,
            department: dept.departementName,
            startDate: MANDATE_START,
          });
          summary.reelected++;
          summary.mandatesOpened++;
        } else {
          // Déjà à jour (rejeu du script) : rien à faire.
        }
      } catch (error) {
        if (isUniqueViolation(error)) {
          logger.warn(
            `  Skipping mandate for ${elu.prenom} ${elu.nom} (${dept.departementName}): ` +
              `official already has a "senateur" mandate starting on the same date — likely a homonym or bad matching`,
          );
          summary.skipped++;
        } else {
          throw error;
        }
      }
    }

    // Sortants non réélus : tout mandat actif du département dont le
    // titulaire ne figure pas parmi les élus (de ce département : un sénateur
    // réélu ailleurs serait clos ici et rouvert dans son nouveau département).
    const outgoing = (activeByDept.get(deptKey) ?? []).filter(
      (mandate) => !reelectedOfficialIds.has(mandate.officialId),
    );
    for (const mandate of outgoing) {
      await db
        .update(mandates)
        .set({ endDate: MANDATE_START, updatedAt: new Date() })
        .where(eq(mandates.id, mandate.id));
      summary.mandatesClosed++;
    }
  }

  logger.info(
    `Senat mandats 2026: ${summary.officialsCreated} nouvelles fiches, ` +
      `${summary.mandatesOpened} mandats ouverts (dont ${summary.reelected} réélections), ` +
      `${summary.mandatesClosed} mandats sortants clôturés, ${summary.skipped} ignorés`,
  );
  return summary;
}
