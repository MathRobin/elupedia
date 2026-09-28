import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
import type { RneConseillerFde } from '../sources/rne-conseillers-fde.js';
import { logger } from '../logger.js';

// Pas de département français pour ces élus : on réutilise l'entrée
// DEPARTMENT_CODES existante ("ZZ") déjà utilisée ailleurs (eurodéputés de
// la circonscription "Français établis hors de France"), pour rester
// cohérent avec le reste du site plutôt que de fabriquer un pseudo-
// département par pays. La circonscription consulaire (plus précise que la
// zone AFE) va dans `district`.
const DEPARTMENT_LABEL = 'Français établis hors de France';

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

export async function upsertConseillersFde(
  db: NeonHttpDatabase,
  conseillers: RneConseillerFde[],
) {
  const summary = {
    officials: 0,
    mandates: 0,
    ended: 0,
    replaced: 0,
    skipped: 0,
  };

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

  // Chaque circonscription consulaire élit plusieurs conseillers (scrutin de
  // liste) : comme pour les autres mandats locaux à N titulaires (régionaux,
  // départementaux, arrondissement), on résout d'abord tous les officials,
  // puis on ferme les mandats dont le titulaire n'apparaît plus dans le
  // fichier RNE pour sa circonscription.
  const resolved: Array<{ row: RneConseillerFde; officialId: string }> = [];
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
    resolved.map(({ row, officialId }) => `${row.consularName}|${officialId}`),
  );

  const activeMandates = await db
    .select({
      id: mandates.id,
      officialId: mandates.officialId,
      district: mandates.district,
    })
    .from(mandates)
    .where(
      and(
        eq(mandates.type, 'conseiller_francais_etranger'),
        isNull(mandates.endDate),
      ),
    );

  const today = new Date().toISOString().split('T')[0];

  for (const m of activeMandates) {
    const pair = `${m.district ?? ''}|${m.officialId}`;
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
      .select({ id: mandates.id, startDate: mandates.startDate })
      .from(mandates)
      .where(
        and(
          eq(mandates.officialId, officialId),
          eq(mandates.type, 'conseiller_francais_etranger'),
          eq(mandates.district, c.consularName),
          isNull(mandates.endDate),
        ),
      )
      .limit(1);
    const current = existingMandate[0];

    const newStartDate = c.mandateStartDate;

    if (!newStartDate) {
      logger.warn(
        `  Skipping mandate for ${c.firstName} ${c.lastName} (${c.consularName}): ` +
          `no mandate start date in source data`,
      );
      summary.skipped++;
      continue;
    }

    const mandateValues = {
      officialId,
      type: 'conseiller_francais_etranger' as const,
      district: c.consularName,
      department: DEPARTMENT_LABEL,
      startDate: newStartDate,
    };

    // Une date de début postérieure à celle du mandat actif signale un
    // remplacement : on clôt l'ancien mandat et on en ouvre un nouveau
    // plutôt que d'écraser la ligne existante, pour ne pas perdre
    // l'historique. Une date antérieure est une simple correction de la
    // période en cours : on met à jour la ligne existante sans l'historiser.
    const isReplacement = !!current && newStartDate > current.startDate;

    if (!current) {
      try {
        await db.insert(mandates).values(mandateValues);
        summary.mandates++;
      } catch (error) {
        if (isUniqueViolation(error)) {
          logger.warn(
            `  Skipping mandate for ${c.firstName} ${c.lastName} (${c.consularName}): ` +
              `official already has a "conseiller_francais_etranger" mandate starting on the same date elsewhere — likely a homonym or bad source data`,
          );
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
          logger.warn(
            `  Skipping mandate for ${c.firstName} ${c.lastName} (${c.consularName}): ` +
              `official already has a "conseiller_francais_etranger" mandate starting on the same date elsewhere — likely a homonym or bad source data`,
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
            startDate: newStartDate,
            endDate: null,
            updatedAt: new Date(),
          })
          .where(eq(mandates.id, current.id));
        summary.mandates++;
      } catch (error) {
        if (isUniqueViolation(error)) {
          logger.warn(
            `  Skipping mandate update for ${c.firstName} ${c.lastName} (${c.consularName}): ` +
              `official already has a "conseiller_francais_etranger" mandate starting on the same date elsewhere — likely a homonym or bad source data`,
          );
          summary.skipped++;
        } else {
          throw error;
        }
      }
    }
  }

  logger.info(
    `Conseillers des Français de l'étranger: ${summary.officials} officials created, ${summary.mandates} mandates upserted, ${summary.ended} mandates ended, ${summary.replaced} replacements historized`,
  );
  return summary;
}
