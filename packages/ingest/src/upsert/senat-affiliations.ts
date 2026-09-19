import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, affiliations, mandates } from '@elupedia/shared';
import { eq, and, sql } from 'drizzle-orm';
import type { SenatAffiliation } from '../sources/senat-groupes.js';
import { logger } from '../logger.js';

/**
 * Le mandat sénateur en cours ne porte aucun groupe politique à sa création
 * (contrairement au mandat député, cf. upsert/officials.ts) : le Sénat expose
 * le groupe séparément, via l'historique des appartenances (ODSEN_HISTOGROUPES).
 * On recopie donc ici le groupe actif sur le mandat sénateur actif, pour que
 * les pages qui lisent mandates.politicalGroup (fiche élu, scrutins, annuaire)
 * l'affichent correctement.
 */
async function syncActiveMandatePoliticalGroups(
  db: NeonHttpDatabase,
): Promise<number> {
  const result = await db.execute(sql`
    UPDATE ${mandates} AS m
    SET political_group = a.party_or_group, updated_at = now()
    FROM ${affiliations} AS a
    WHERE m.official_id = a.official_id
      AND a.kind = 'group'
      AND a.end_date IS NULL
      AND m.type = 'senateur'
      AND m.end_date IS NULL
      AND m.political_group IS DISTINCT FROM a.party_or_group
  `);
  return result.rowCount ?? 0;
}

export async function upsertSenatAffiliations(
  db: NeonHttpDatabase,
  items: SenatAffiliation[],
) {
  const summary = { created: 0, updated: 0 };
  const cache = new Map<string, string>();

  for (const item of items) {
    let officialId = cache.get(item.matricule);
    if (!officialId) {
      const matches = await db
        .select({ id: officials.id })
        .from(officials)
        .where(eq(officials.senatId, item.matricule))
        .limit(1);
      if (matches.length === 0) continue;
      officialId = matches[0].id;
      cache.set(item.matricule, officialId);
    }

    if (!item.start_date) continue;

    const existing = await db
      .select()
      .from(affiliations)
      .where(
        and(
          eq(affiliations.officialId, officialId),
          eq(affiliations.partyOrGroup, item.group_name),
          eq(affiliations.startDate, item.start_date),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(affiliations).values({
        officialId,
        partyOrGroup: item.group_name,
        startDate: item.start_date,
        endDate: item.end_date,
      });
      summary.created++;
    } else {
      await db
        .update(affiliations)
        .set({ endDate: item.end_date, updatedAt: new Date() })
        .where(eq(affiliations.id, existing[0].id));
      summary.updated++;
    }
  }

  const mandatesSynced = await syncActiveMandatePoliticalGroups(db);

  logger.info(
    `Senate affiliations: ${summary.created} created, ${summary.updated} updated, ${mandatesSynced} active mandate(s) synced with their group`,
  );
  return summary;
}
