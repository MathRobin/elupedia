import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { RneMembreAssemblee } from '../sources/rne-membres-assemblee.js';
import { logger } from '../logger.js';

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
function territory(m: RneMembreAssemblee): {
  district: string;
  department: string;
} {
  if (m.circonscriptionName) {
    return { district: m.circonscriptionName, department: m.departmentName };
  }
  return { district: m.collectiviteName, department: m.collectiviteName };
}

function territoryKey(department: string, district: string): string {
  return `${department}|${district}`;
}

export async function upsertMembresAssemblee(
  db: NeonHttpDatabase,
  membres: RneMembreAssemblee[],
) {
  const summary = { officials: 0, mandates: 0, ended: 0, skipped: 0 };

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
  for (const o of allOfficials) {
    const key = `${o.firstName.toLowerCase()}|${o.lastName.toLowerCase()}|${o.birthDate ?? ''}`;
    officialByKey.set(key, { id: o.id, slug: o.slug });
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

  // Comme pour les autres mandats locaux à N titulaires (régionaux,
  // arrondissement), on résout d'abord tous les officials, puis on ferme les
  // mandats dont le titulaire n'apparaît plus dans le fichier RNE pour son
  // territoire.
  const resolved: Array<{ row: RneMembreAssemblee; officialId: string }> = [];
  for (const m of membres) {
    const key = `${m.firstName.toLowerCase()}|${m.lastName.toLowerCase()}|${m.birthDate}`;
    let official = officialByKey.get(key);

    if (!official) {
      const slug = uniqueSlug(slugify(m.firstName, m.lastName));
      const [inserted] = await db
        .insert(officials)
        .values({
          firstName: m.firstName,
          lastName: m.lastName,
          birthDate: m.birthDate,
          slug,
        })
        .returning({ id: officials.id });
      official = { id: inserted!.id, slug };
      officialByKey.set(key, official);
      summary.officials++;
    }

    resolved.push({ row: m, officialId: official.id });
  }

  const currentPairs = new Set(
    resolved.map(({ row, officialId }) => {
      const t = territory(row);
      return `${territoryKey(t.department, t.district)}|${officialId}`;
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
    .where(
      and(
        eq(mandates.type, 'membre_assemblee_statut_particulier'),
        isNull(mandates.endDate),
      ),
    );

  const today = new Date().toISOString().split('T')[0];

  for (const m of activeMandates) {
    const pair = `${territoryKey(m.department ?? '', m.district ?? '')}|${m.officialId}`;
    if (!currentPairs.has(pair)) {
      await db
        .update(mandates)
        .set({ endDate: today, updatedAt: new Date() })
        .where(eq(mandates.id, m.id));
      summary.ended++;
    }
  }

  for (const { row: m, officialId } of resolved) {
    const t = territory(m);

    const existingMandate = await db
      .select({ id: mandates.id })
      .from(mandates)
      .where(
        and(
          eq(mandates.officialId, officialId),
          eq(mandates.type, 'membre_assemblee_statut_particulier'),
          eq(mandates.district, t.district),
        ),
      )
      .limit(1);

    if (existingMandate.length === 0) {
      try {
        await db.insert(mandates).values({
          officialId,
          type: 'membre_assemblee_statut_particulier',
          district: t.district,
          department: t.department,
          startDate: m.mandateStartDate || m.functionStartDate,
        });
        summary.mandates++;
      } catch (error) {
        if (isUniqueViolation(error)) {
          logger.warn(
            `  Skipping mandate for ${m.firstName} ${m.lastName} (${t.district}): ` +
              `official already has a "membre_assemblee_statut_particulier" mandate starting on the same date elsewhere — likely a homonym or bad source data`,
          );
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
            department: t.department,
            startDate: m.mandateStartDate || m.functionStartDate,
            endDate: null,
            updatedAt: new Date(),
          })
          .where(eq(mandates.id, existingMandate[0].id));
        summary.mandates++;
      } catch (error) {
        if (isUniqueViolation(error)) {
          logger.warn(
            `  Skipping mandate update for ${m.firstName} ${m.lastName} (${t.district}): ` +
              `official already has a "membre_assemblee_statut_particulier" mandate starting on the same date elsewhere — likely a homonym or bad source data`,
          );
          summary.skipped++;
        } else {
          throw error;
        }
      }
    }
  }

  logger.info(
    `Membres assemblée statut particulier: ${summary.officials} officials created, ${summary.mandates} mandates upserted, ${summary.ended} mandates ended`,
  );
  return summary;
}
