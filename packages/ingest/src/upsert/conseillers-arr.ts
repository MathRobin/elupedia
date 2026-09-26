import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { RneConseillerArr } from '../sources/rne-conseillers-arr.js';
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

// Le fichier RNE mélange conseillers simples, adjoints et maire
// d'arrondissement (Paris/Lyon/Marseille) sous un seul secteur — sans code
// INSEE propre à l'arrondissement (seul le code commune de la ville entière
// est fourni). On modélise donc tout le monde en `conseiller_arrondissement`,
// y compris le "Maire d'arrondissement" : le distinguer en tant que `maire`
// nécessiterait un code INSEE d'arrondissement que cette source ne fournit
// pas (voir commentaire du ticket M26T2).
function sectorKey(communeName: string, sectorLabel: string): string {
  return `${communeName}|${sectorLabel}`;
}

export async function upsertConseillersArr(
  db: NeonHttpDatabase,
  conseillers: RneConseillerArr[],
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

  // Comme pour les sections régionales, un secteur d'arrondissement compte de
  // nombreux titulaires (conseil d'arrondissement complet) : on résout donc
  // d'abord tous les officials, puis on ferme les mandats dont le titulaire
  // n'apparaît plus dans le fichier RNE pour son secteur.
  const resolved: Array<{ row: RneConseillerArr; officialId: string }> = [];
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
        `${sectorKey(row.communeName, row.sectorLabel)}|${officialId}`,
    ),
  );

  const activeMandates = await db
    .select({
      id: mandates.id,
      officialId: mandates.officialId,
      district: mandates.district,
      communeCode: mandates.communeCode,
    })
    .from(mandates)
    .where(
      and(
        eq(mandates.type, 'conseiller_arrondissement'),
        isNull(mandates.endDate),
      ),
    );

  const communeNameByCode = new Map(
    conseillers.map((c) => [c.communeCode, c.communeName]),
  );

  const today = new Date().toISOString().split('T')[0];

  for (const m of activeMandates) {
    const communeName = communeNameByCode.get(m.communeCode ?? '') ?? '';
    const pair = `${sectorKey(communeName, m.district ?? '')}|${m.officialId}`;
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
          eq(mandates.type, 'conseiller_arrondissement'),
          eq(mandates.district, c.sectorLabel),
        ),
      )
      .limit(1);

    if (existingMandate.length === 0) {
      try {
        await db.insert(mandates).values({
          officialId,
          type: 'conseiller_arrondissement',
          district: c.sectorLabel,
          department: c.departmentName,
          communeCode: c.communeCode,
          startDate: c.mandateStartDate || c.functionStartDate,
        });
        summary.mandates++;
      } catch (error) {
        if (isUniqueViolation(error)) {
          logger.warn(
            `  Skipping mandate for ${c.firstName} ${c.lastName} (${c.sectorLabel}): ` +
              `official already has a "conseiller_arrondissement" mandate starting on the same date elsewhere — likely a homonym or bad source data`,
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
            department: c.departmentName,
            communeCode: c.communeCode,
            startDate: c.mandateStartDate || c.functionStartDate,
            endDate: null,
            updatedAt: new Date(),
          })
          .where(eq(mandates.id, existingMandate[0].id));
        summary.mandates++;
      } catch (error) {
        if (isUniqueViolation(error)) {
          logger.warn(
            `  Skipping mandate update for ${c.firstName} ${c.lastName} (${c.sectorLabel}): ` +
              `official already has a "conseiller_arrondissement" mandate starting on the same date elsewhere — likely a homonym or bad source data`,
          );
          summary.skipped++;
        } else {
          throw error;
        }
      }
    }
  }

  logger.info(
    `Conseillers d'arrondissement: ${summary.officials} officials created, ${summary.mandates} mandates upserted, ${summary.ended} mandates ended`,
  );
  return summary;
}
