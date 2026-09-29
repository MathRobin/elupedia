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

function normalize(s: string): string {
  return s
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

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && (error as { code?: unknown }).code === '23505') {
    return true;
  }
  if ('cause' in error) {
    return isUniqueViolation((error as { cause?: unknown }).cause);
  }
  return false;
}

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
  for (const o of allOfficials) {
    const key = `${normalize(o.lastName)}|${normalize(o.firstName)}`;
    officialByName.set(key, { id: o.id });
  }

  const slugSet = new Set(
    allOfficials.filter((o) => o.slug).map((o) => o.slug!),
  );
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

  const activeSenateurMandates = await db
    .select({
      id: mandates.id,
      officialId: mandates.officialId,
      department: mandates.department,
      startDate: mandates.startDate,
    })
    .from(mandates)
    .where(and(eq(mandates.type, 'senateur'), isNull(mandates.endDate)));

  const activeByOfficial = new Map<
    string,
    { id: string; department: string | null; startDate: string }
  >();
  const activeByDept = new Map<string, { id: string; officialId: string }[]>();
  for (const m of activeSenateurMandates) {
    activeByOfficial.set(m.officialId, m);
    if (m.department) {
      const key = normalize(m.department);
      const list = activeByDept.get(key) ?? [];
      list.push({ id: m.id, officialId: m.officialId });
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

    const outgoing = (activeByDept.get(deptKey) ?? []).filter(
      (m) => !reelectedOfficialIds.has(m.officialId),
    );
    for (const m of outgoing) {
      await db
        .update(mandates)
        .set({ endDate: MANDATE_START, updatedAt: new Date() })
        .where(eq(mandates.id, m.id));
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
