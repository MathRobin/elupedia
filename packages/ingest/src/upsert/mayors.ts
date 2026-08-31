import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, mandates } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { RneMaire } from '../sources/rne-maires.js';
import { logger } from '../logger.js';

function slugify(firstName: string, lastName: string): string {
  return `${firstName}-${lastName}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function upsertMayors(db: NeonHttpDatabase, maires: RneMaire[]) {
  const summary = { officials: 0, mandates: 0, skipped: 0 };

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

  for (const maire of maires) {
    const key = `${maire.firstName.toLowerCase()}|${maire.lastName.toLowerCase()}|${maire.birthDate}`;
    let official = officialByKey.get(key);

    if (!official) {
      const slug = uniqueSlug(slugify(maire.firstName, maire.lastName));
      const [inserted] = await db
        .insert(officials)
        .values({
          firstName: maire.firstName,
          lastName: maire.lastName,
          birthDate: maire.birthDate,
          slug,
        })
        .returning({ id: officials.id });
      official = { id: inserted!.id, slug };
      officialByKey.set(key, official);
      summary.officials++;
    }

    const existingMandate = await db
      .select({ id: mandates.id })
      .from(mandates)
      .where(
        and(
          eq(mandates.officialId, official.id),
          eq(mandates.type, 'maire'),
          eq(mandates.communeCode, maire.communeCode),
        ),
      )
      .limit(1);

    if (existingMandate.length === 0) {
      await db.insert(mandates).values({
        officialId: official.id,
        type: 'maire',
        district: maire.communeName,
        department: maire.departmentName,
        startDate: maire.mandateStartDate || maire.functionStartDate,
        communeCode: maire.communeCode,
      });
      summary.mandates++;
    } else {
      await db
        .update(mandates)
        .set({
          district: maire.communeName,
          department: maire.departmentName,
          startDate: maire.mandateStartDate || maire.functionStartDate,
        })
        .where(eq(mandates.id, existingMandate[0].id));
      summary.mandates++;
    }
  }

  logger.info(
    `Mayors: ${summary.officials} officials created, ${summary.mandates} mandates upserted`,
  );
  return summary;
}
