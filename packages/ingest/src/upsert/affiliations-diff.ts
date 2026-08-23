import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, affiliations } from '@elupedia/shared';
import { eq, and, isNull } from 'drizzle-orm';
export interface AffiliationData {
  slug: string;
  id_an?: string;
  groupe_sigle?: string;
  parti_ratt_financier?: string;
}

export async function diffAffiliations(
  db: NeonHttpDatabase,
  deputeAffiliations: AffiliationData[],
) {
  const today = new Date().toISOString().split('T')[0];
  const summary = { created: 0, ended: 0, unchanged: 0 };

  for (const depute of deputeAffiliations) {
    const anId = depute.id_an;
    if (!anId) continue;

    const group = depute.groupe_sigle ?? depute.parti_ratt_financier;
    if (!group) continue;

    const [official] = await db
      .select()
      .from(officials)
      .where(eq(officials.anId, anId))
      .limit(1);

    if (!official) continue;

    const currentAffiliations = await db
      .select()
      .from(affiliations)
      .where(
        and(
          eq(affiliations.officialId, official.id),
          isNull(affiliations.endDate),
        ),
      );

    const activeGroup = currentAffiliations.find(
      (a) => a.partyOrGroup === group,
    );

    if (activeGroup) {
      summary.unchanged++;
    } else {
      for (const aff of currentAffiliations) {
        await db
          .update(affiliations)
          .set({ endDate: today })
          .where(eq(affiliations.id, aff.id));
        summary.ended++;
      }

      await db.insert(affiliations).values({
        officialId: official.id,
        partyOrGroup: group,
        startDate: today,
      });
      summary.created++;
    }
  }

  return summary;
}
