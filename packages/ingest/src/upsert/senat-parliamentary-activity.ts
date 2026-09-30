import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, parliamentaryActivity } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { SenateurActivity } from '../sources/senat-activite.js';
import { logger } from '../logger.js';
import { withRetry } from '../utils/retry.js';

const INSERT_CHUNK_SIZE = 500;
const LOG_CHUNK_SIZE = 50;
// Ce driver Neon HTTP fait un aller-retour HTTP par requête, sans connexion
// persistante : sur ~1500 sénateurs traités séquentiellement (1 select +
// 0..N update/insert chacun), un simple blip réseau isolé était auparavant
// fatal à tout le run — l'exception remontait jusqu'à runStep (run-senat.ts)
// dont le withRetry rejoue toute la fonction depuis le premier sénateur,
// perdant ~20-25 min de progression pour un incident transitoire (constaté
// en conditions réelles le 30/09/2026, même famille de problème que
// l'incident 429 PE du 29/09/2026, cf. upsert/europe-questions.ts). Un petit
// retry par sénateur absorbe les blips isolés ; au-delà d'un nombre
// d'échecs consécutifs, on suppose une panne systémique (Neon indisponible)
// et on s'arrête proprement plutôt que de rejouer indéfiniment — le dump
// source n'étant pas paginé/curseuré, le prochain run repart de toute façon
// du même jeu de données complet.
const MAX_CONSECUTIVE_FAILURES = 5;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function processSenateur(
  db: NeonHttpDatabase,
  officialId: string,
  senateur: SenateurActivity,
  summary: { created: number; updated: number; skipped: number },
): Promise<void> {
  const existingActivities = await db
    .select()
    .from(parliamentaryActivity)
    .where(eq(parliamentaryActivity.officialId, officialId));

  const existingByKey = new Map(
    existingActivities.map((a) => [
      `${a.source}|${a.type}|${a.title}|${a.date}`,
      a,
    ]),
  );

  const newRows: (typeof parliamentaryActivity.$inferInsert)[] = [];

  for (const item of senateur.activities) {
    const key = `senat|${item.type}|${item.title}|${item.date}`;
    const existing = existingByKey.get(key);

    if (!existing) {
      newRows.push({
        officialId,
        type: item.type,
        source: 'senat',
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

export async function upsertSenatParliamentaryActivity(
  db: NeonHttpDatabase,
  senateurActivities: SenateurActivity[],
) {
  const summary = { created: 0, updated: 0, skipped: 0 };

  const officialRows = await db
    .select({ id: officials.id, senatId: officials.senatId })
    .from(officials);

  const officialByMatricule = new Map<string, string>();
  for (const row of officialRows) {
    if (row.senatId) {
      officialByMatricule.set(row.senatId.trim(), row.id);
    }
  }

  logger.info(
    `  Officials cache: ${officialByMatricule.size} sénateurs mappés`,
  );

  logger.info(`  ${senateurActivities.length} sénateurs to process`);

  let consecutiveFailures = 0;
  let stoppedEarly = false;

  for (let i = 0; i < senateurActivities.length; i++) {
    const senateur = senateurActivities[i];

    if (i % LOG_CHUNK_SIZE === 0) {
      logger.info(
        `  [${i + 1}/${senateurActivities.length}] sénat parliamentary activity...`,
      );
    }

    const officialId = officialByMatricule.get(senateur.matricule.trim());
    if (!officialId) {
      summary.skipped += senateur.activities.length;
      continue;
    }

    try {
      // Un aller-retour HTTP par requête (driver Neon HTTP), sans transaction
      // ni retry natif : 2 essais absorbent un blip réseau isolé sans
      // attendre les 1s/2s de withRetry côté runStep, qui rejouerait sinon
      // tout le run depuis le premier sénateur (cf. commentaire en tête de
      // fichier).
      await withRetry(
        () => processSenateur(db, officialId, senateur, summary),
        {
          source: `senat-activite ${senateur.matricule}`,
          maxAttempts: 2,
          baseDelayMs: 500,
        },
      );
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures++;
      logger.warn(
        `  Failed processing activity for sénateur ${senateur.matricule} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}) : ${error instanceof Error ? error.message : String(error)}`,
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.warn(
          `  ${MAX_CONSECUTIVE_FAILURES} échecs consécutifs, arrêt du run — probable panne côté base de données`,
        );
        stoppedEarly = true;
        break;
      }
    }
  }

  logger.info(
    `Sénat parliamentary activity: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped (no matching official)` +
      (stoppedEarly ? ' — arrêt anticipé (voir logs ci-dessus)' : ''),
  );
  return summary;
}
