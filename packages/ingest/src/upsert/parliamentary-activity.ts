/**
 * Upsert de l'activité parlementaire des députés (questions écrites/orales,
 * amendements, rapports...) lue par `sources/an-activite.ts`, appelé par
 * `run-an.ts` (`ingest:an`) et `run-an-partial.ts`.
 *
 * Table écrite : `parliamentary_activity` (source `assemblee_nationale`).
 *
 * Clé de rapprochement : official + source + type + titre + date (pas d'id
 * stable côté AN pour tous les types d'activité). Un député sans fiche
 * `officials` (an_id inconnu) est ignoré silencieusement.
 *
 * Idempotent : une ligne existante n'est réécrite que si l'un de ses champs
 * a changé (typiquement l'arrivée d'une réponse ministérielle). Rien n'est
 * supprimé. Une erreur sur un député interrompt tout le lot.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, parliamentaryActivity } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { DeputeActivity } from '../sources/an-activite.js';
import { logger } from '../logger.js';

/** Taille des INSERT groupés (limite de paramètres Postgres). */
const INSERT_CHUNK_SIZE = 500;
/** Un log d'avancement tous les N députés. */
const LOG_CHUNK_SIZE = 50;

const SOURCE = 'assemblee_nationale';

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Upsert de l'activité de chaque député. Écrit dans `parliamentary_activity`.
 * Retourne le nombre de lignes créées et mises à jour.
 */
export async function upsertParliamentaryActivity(
  db: NeonHttpDatabase,
  deputeActivities: DeputeActivity[],
) {
  const summary = { created: 0, updated: 0 };

  const allOfficials = await db
    .select({ id: officials.id, anId: officials.anId })
    .from(officials);
  const officialByAnId = new Map<string, string>();
  for (const official of allOfficials) {
    if (official.anId) officialByAnId.set(official.anId, official.id);
  }

  logger.info(
    `  ${deputeActivities.length} deputes to process (${officialByAnId.size} officials mapped)`,
  );

  for (let i = 0; i < deputeActivities.length; i++) {
    const depute = deputeActivities[i];

    if (i % LOG_CHUNK_SIZE === 0) {
      logger.info(
        `  [${i + 1}/${deputeActivities.length}] parliamentary activity...`,
      );
    }

    const officialId = officialByAnId.get(depute.id_an);
    if (!officialId) continue;

    try {
      await processDeputeActivities(db, officialId, depute, summary);
    } catch (error) {
      logger.error(
        `  Failed processing activity for ${depute.id_an}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  logger.info(
    `Parliamentary activity: ${summary.created} created, ${summary.updated} updated`,
  );
  return summary;
}

/** Clé de rapprochement d'une activité, identique côté DB et côté source. */
function activityKey(
  source: string,
  type: string,
  title: string,
  date: string,
): string {
  return `${source}|${type}|${title}|${date}`;
}

/**
 * Compare les activités d'un député à celles déjà en base : insère les
 * nouvelles (par paquets) et met à jour celles dont un champ a changé.
 */
async function processDeputeActivities(
  db: NeonHttpDatabase,
  officialId: string,
  depute: DeputeActivity,
  summary: { created: number; updated: number },
) {
  const existingActivities = await db
    .select()
    .from(parliamentaryActivity)
    .where(eq(parliamentaryActivity.officialId, officialId));

  const existingByKey = new Map(
    existingActivities.map((activity) => [
      activityKey(
        activity.source,
        activity.type,
        activity.title,
        activity.date,
      ),
      activity,
    ]),
  );

  const newRows: (typeof parliamentaryActivity.$inferInsert)[] = [];

  for (const item of depute.activities) {
    const key = activityKey(SOURCE, item.type, item.title, item.date);
    const existing = existingByKey.get(key);

    if (!existing) {
      newRows.push({
        officialId,
        type: item.type,
        source: SOURCE,
        title: item.title,
        date: item.date,
        status: item.status ?? null,
        questionText: item.questionText ?? null,
        responseText: item.responseText ?? null,
        responseDate: item.responseDate ?? null,
        governmentComments: item.ministry ?? null,
        sourceUrl: item.sourceUrl ?? null,
        rubrique: item.rubrique ?? null,
        teteAnalyse: item.teteAnalyse ?? null,
        questionNumber: item.questionNumber ?? null,
      });
    } else if (
      // Mise à jour seulement si un champ a changé, pour ne pas toucher
      // updated_at (et ne pas émettre des milliers d'UPDATE inutiles).
      existing.status !== (item.status ?? null) ||
      existing.questionText !== (item.questionText ?? null) ||
      existing.responseText !== (item.responseText ?? null) ||
      existing.responseDate !== (item.responseDate ?? null) ||
      existing.governmentComments !== (item.ministry ?? null) ||
      existing.sourceUrl !== (item.sourceUrl ?? null) ||
      existing.rubrique !== (item.rubrique ?? null) ||
      existing.teteAnalyse !== (item.teteAnalyse ?? null) ||
      existing.questionNumber !== (item.questionNumber ?? null)
    ) {
      await db
        .update(parliamentaryActivity)
        .set({
          status: item.status ?? null,
          questionText: item.questionText ?? null,
          responseText: item.responseText ?? null,
          responseDate: item.responseDate ?? null,
          governmentComments: item.ministry ?? null,
          sourceUrl: item.sourceUrl ?? null,
          rubrique: item.rubrique ?? null,
          teteAnalyse: item.teteAnalyse ?? null,
          questionNumber: item.questionNumber ?? null,
          updatedAt: new Date(),
        })
        .where(eq(parliamentaryActivity.id, existing.id));
      summary.updated++;
    }
  }

  for (const rowChunk of chunk(newRows, INSERT_CHUNK_SIZE)) {
    await db.insert(parliamentaryActivity).values(rowChunk);
    summary.created += rowChunk.length;
  }
}
