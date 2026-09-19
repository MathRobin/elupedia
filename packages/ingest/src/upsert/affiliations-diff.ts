import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, affiliations } from '@elupedia/shared';
import { eq, isNull, and } from 'drizzle-orm';
import { writeProvenanceBatch } from './provenance.js';

export interface AffiliationData {
  slug: string;
  id_an?: string;
  groupe_sigle?: string;
  parti_ratt_financier?: string;
}

const SOURCE_NAME = 'Assemblée nationale - Open Data';
const LEGAL_BASIS =
  "Données publiques d'appartenance à un groupe parlementaire (art. L311-1 CRPA)";

export async function diffAffiliations(
  db: NeonHttpDatabase,
  deputeAffiliations: AffiliationData[],
) {
  const today = new Date().toISOString().split('T')[0];
  const summary = { created: 0, ended: 0, unchanged: 0 };

  const allOfficials = await db
    .select({ id: officials.id, anId: officials.anId })
    .from(officials);
  const officialByAnId = new Map<string, string>();
  for (const o of allOfficials) {
    if (o.anId) officialByAnId.set(o.anId, o.id);
  }

  const activeAffiliations = await db
    .select()
    .from(affiliations)
    .where(and(eq(affiliations.kind, 'group'), isNull(affiliations.endDate)));
  const activeByOfficialId = new Map<
    string,
    (typeof affiliations.$inferSelect)[]
  >();
  for (const a of activeAffiliations) {
    const list = activeByOfficialId.get(a.officialId) ?? [];
    list.push(a);
    activeByOfficialId.set(a.officialId, list);
  }

  const newRows: (typeof affiliations.$inferInsert)[] = [];
  const provenanceItems: Parameters<typeof writeProvenanceBatch>[1] = [];

  for (const depute of deputeAffiliations) {
    const anId = depute.id_an;
    if (!anId) continue;

    const group = depute.groupe_sigle ?? depute.parti_ratt_financier;
    if (!group) continue;

    const officialId = officialByAnId.get(anId);
    if (!officialId) continue;

    const currentAffiliations = activeByOfficialId.get(officialId) ?? [];
    const activeGroup = currentAffiliations.find(
      (a) => a.partyOrGroup === group,
    );

    if (activeGroup) {
      summary.unchanged++;
    } else {
      for (const aff of currentAffiliations) {
        await db
          .update(affiliations)
          .set({ endDate: today, updatedAt: new Date() })
          .where(eq(affiliations.id, aff.id));
        summary.ended++;
      }

      newRows.push({
        officialId,
        partyOrGroup: group,
        startDate: today,
      });
      summary.created++;
    }

    provenanceItems.push({
      sourceTable: 'affiliations',
      sourceRecordId: `${anId}:${group}`,
      sourceName: SOURCE_NAME,
      sourceUrl: `https://www.assemblee-nationale.fr/dyn/deputes/${anId}`,
      legalBasis: LEGAL_BASIS,
      rawData: depute,
    });
  }

  if (newRows.length > 0) {
    await db.insert(affiliations).values(newRows);
  }

  await writeProvenanceBatch(db, provenanceItems);

  return summary;
}
