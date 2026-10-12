/**
 * Insertion des mentions presse (Google Actualités, `sources/google-news.ts`),
 * appelé par `run-press.ts` et `run-press-maires.ts`.
 *
 * Table écrite : `press_mentions`.
 * Clé de rapprochement : official + `source_url`.
 *
 * Insert-only : une mention déjà connue n'est jamais réécrite (titre et date
 * de première capture conservés), d'où `updated` toujours à 0.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { pressMentions } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { PressMentionData } from '../sources/google-news.js';

/**
 * Insère les mentions presse inconnues (official + URL). Écrit dans
 * `press_mentions`. Retourne le nombre de lignes créées.
 */
export async function upsertPressMentions(
  db: NeonHttpDatabase,
  mentions: PressMentionData[],
) {
  const summary = { created: 0, updated: 0 };

  for (const mention of mentions) {
    const existing = await db
      .select({ id: pressMentions.id })
      .from(pressMentions)
      .where(
        and(
          eq(pressMentions.officialId, mention.officialId),
          eq(pressMentions.sourceUrl, mention.sourceUrl),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(pressMentions).values({
        officialId: mention.officialId,
        title: mention.title,
        sourceName: mention.sourceName,
        sourceUrl: mention.sourceUrl,
        publishedDate: mention.publishedDate,
      });
      summary.created++;
    }
  }

  return summary;
}
