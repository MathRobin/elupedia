import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { madadaRequests } from '@elupedia/shared';
import { type MadadaRequest } from '../sources/madada-requests.js';

export async function upsertMadadaRequests(
  db: NeonHttpDatabase,
  communeCode: string,
  requests: MadadaRequest[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const req of requests) {
    const result = await db
      .insert(madadaRequests)
      .values({
        madadaId: req.madadaId,
        communeCode,
        urlTitle: req.urlTitle,
        title: req.title,
        status: req.status,
        createdAt: new Date(req.createdAt),
        updatedAt: new Date(req.updatedAt),
      })
      .onConflictDoUpdate({
        target: madadaRequests.madadaId,
        set: {
          status: sql`excluded."status"`,
          updatedAt: sql`excluded."updated_at"`,
        },
      })
      .returning({ id: madadaRequests.madadaId });

    if (result.length > 0) {
      created++;
    } else {
      updated++;
    }
  }

  return { created, updated };
}
