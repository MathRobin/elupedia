import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { pressMentions } from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { PressMentionData } from '../sources/google-news.js';

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
