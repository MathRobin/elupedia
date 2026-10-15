/**
 * Upsert des appartenances des députés aux commissions et organes de
 * l'Assemblée (table `committees`) à partir de `sources/an-commissions.ts`.
 * Appelé par `run-an.ts`.
 *
 * Clé de rapprochement : (official_id, name, type, start_date) — un même
 * député peut siéger plusieurs fois dans la même commission à des périodes
 * différentes, d'où la date de début dans la clé. L'official est retrouvé
 * par `officials.an_id`.
 * Idempotent : une ligne existante n'est mise à jour que si `end_date` a
 * changé ou si la source apporte un `an_uid` différent. Un `an_uid` déjà en
 * base n'est jamais effacé par une source qui ne le fournit plus.
 * Les anciens libellés doublonnés (« nom » / « nom (abrégé) ») sont traités
 * à part par `dedupe:committees`, pas ici.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, committees } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { DeputeCommittees } from '../sources/an-commissions.js';
import { logger } from '../logger.js';

// Taille max d'un INSERT multi-lignes.
const INSERT_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function committeeKey(
  officialId: string,
  name: string,
  type: string,
  startDate: string,
): string {
  return `${officialId}|${name}|${type}|${startDate}`;
}

/**
 * Insère les nouvelles appartenances et met à jour date de fin / an_uid des
 * existantes (écriture DB). Retourne les compteurs created / updated.
 */
export async function upsertCommittees(
  db: NeonHttpDatabase,
  deputeCommittees: DeputeCommittees[],
) {
  const summary = { created: 0, updated: 0 };

  const allOfficials = await db
    .select({ id: officials.id, anId: officials.anId })
    .from(officials);
  const officialByAnId = new Map<string, string>();
  for (const official of allOfficials) {
    if (official.anId) officialByAnId.set(official.anId, official.id);
  }

  const allCommittees = await db.select().from(committees);
  const existingByKey = new Map<string, typeof committees.$inferSelect>();
  for (const committee of allCommittees) {
    existingByKey.set(
      committeeKey(
        committee.officialId,
        committee.name,
        committee.type,
        committee.startDate,
      ),
      committee,
    );
  }

  const newRows: (typeof committees.$inferInsert)[] = [];

  logger.info(`  ${deputeCommittees.length} deputes to process`);

  for (const depute of deputeCommittees) {
    const officialId = officialByAnId.get(depute.id_an);
    if (!officialId) continue;

    try {
      for (const item of depute.committees) {
        const key = committeeKey(
          officialId,
          item.name,
          item.type,
          item.start_date,
        );
        const existing = existingByKey.get(key);

        if (!existing) {
          newRows.push({
            officialId,
            name: item.name,
            type: item.type,
            anUid: item.an_uid ?? null,
            startDate: item.start_date,
            endDate: item.end_date ?? null,
          });
          summary.created++;
        } else if (
          existing.endDate !== (item.end_date ?? null) ||
          (item.an_uid && existing.anUid !== item.an_uid)
        ) {
          await db
            .update(committees)
            .set({
              endDate: item.end_date ?? null,
              anUid: item.an_uid ?? existing.anUid,
              updatedAt: new Date(),
            })
            .where(eq(committees.id, existing.id));
          summary.updated++;
        }
      }
    } catch (error) {
      logger.error(
        `  Failed processing committees for ${depute.id_an}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  for (const rowChunk of chunk(newRows, INSERT_CHUNK_SIZE)) {
    await db.insert(committees).values(rowChunk);
  }

  logger.info(
    `Committees: ${summary.created} created, ${summary.updated} updated`,
  );
  return summary;
}
