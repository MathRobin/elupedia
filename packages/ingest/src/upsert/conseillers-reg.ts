import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { RneConseillerReg } from '../sources/rne-conseillers-reg.js';
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

// Une "section départementale" du RNE correspond en pratique à un vrai
// département (ex. "Ain", "Métropole de Lyon") : on la stocke dans
// `department`, comme pour les autres types de mandat, plutôt que la région —
// ça garde le filtre "Département" du site cohérent entre tous les mandats.
// `district` porte la région (l'assemblée où siège l'élu).
function sectionKey(regionName: string, sectionName: string): string {
  return `${regionName}|${sectionName}`;
}

export async function upsertConseillersReg(
  db: NeonHttpDatabase,
  conseillers: RneConseillerReg[],
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

  // Chaque section départementale élit plusieurs titulaires (scrutin de liste,
  // effectif variable selon la population) — même problème que les cantons
  // départementaux (2 sièges) mais généralisé à N. On résout donc d'abord tous
  // les officials, puis on ferme les mandats dont le titulaire n'apparaît plus
  // dans le fichier RNE pour sa section.
  const resolved: Array<{ row: RneConseillerReg; officialId: string }> = [];
  for (const c of conseillers) {
    const key = `${c.firstName.toLowerCase()}|${c.lastName.toLowerCase()}|${c.birthDate}`;
    let official = officialByKey.get(key);

    if (!official) {
      const slug = uniqueSlug(slugify(c.firstName, c.lastName));
      const [inserted] = await db
        .insert(officials)
        .values({
          firstName: c.firstName,
          lastName: c.lastName,
          birthDate: c.birthDate,
          slug,
        })
        .returning({ id: officials.id });
      official = { id: inserted!.id, slug };
      officialByKey.set(key, official);
      summary.officials++;
    }

    resolved.push({ row: c, officialId: official.id });
  }

  const currentPairs = new Set(
    resolved.map(
      ({ row, officialId }) =>
        `${sectionKey(row.regionName, row.sectionName)}|${officialId}`,
    ),
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
      and(eq(mandates.type, 'conseiller_regional'), isNull(mandates.endDate)),
    );

  const today = new Date().toISOString().split('T')[0];

  for (const m of activeMandates) {
    const pair = `${sectionKey(m.district ?? '', m.department ?? '')}|${m.officialId}`;
    if (!currentPairs.has(pair)) {
      await db
        .update(mandates)
        .set({ endDate: today, updatedAt: new Date() })
        .where(eq(mandates.id, m.id));
      summary.ended++;
    }
  }

  for (const { row: c, officialId } of resolved) {
    const existingMandate = await db
      .select({ id: mandates.id })
      .from(mandates)
      .where(
        and(
          eq(mandates.officialId, officialId),
          eq(mandates.type, 'conseiller_regional'),
          eq(mandates.department, c.sectionName),
        ),
      )
      .limit(1);

    if (existingMandate.length === 0) {
      try {
        await db.insert(mandates).values({
          officialId,
          type: 'conseiller_regional',
          district: c.regionName,
          department: c.sectionName,
          startDate: c.mandateStartDate || c.functionStartDate,
        });
        summary.mandates++;
      } catch (error) {
        if (isUniqueViolation(error)) {
          logger.warn(
            `  Skipping mandate for ${c.firstName} ${c.lastName} (${c.sectionName}, ${c.regionName}): ` +
              `official already has a "conseiller_regional" mandate starting on the same date elsewhere — likely a homonym or bad source data`,
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
            district: c.regionName,
            startDate: c.mandateStartDate || c.functionStartDate,
            endDate: null,
            updatedAt: new Date(),
          })
          .where(eq(mandates.id, existingMandate[0].id));
        summary.mandates++;
      } catch (error) {
        if (isUniqueViolation(error)) {
          logger.warn(
            `  Skipping mandate update for ${c.firstName} ${c.lastName} (${c.sectionName}, ${c.regionName}): ` +
              `official already has a "conseiller_regional" mandate starting on the same date elsewhere — likely a homonym or bad source data`,
          );
          summary.skipped++;
        } else {
          throw error;
        }
      }
    }
  }

  logger.info(
    `Conseillers régionaux: ${summary.officials} officials created, ${summary.mandates} mandates upserted, ${summary.ended} mandates ended`,
  );
  return summary;
}
