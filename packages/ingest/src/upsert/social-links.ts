/**
 * Upsert des liens réseaux sociaux officiels des députés (open data AN,
 * `sources/an-reseaux-sociaux.ts`), appelé par `run-social-links.ts`
 * (`ingest:social-links`). Pendant AN de `upsert/senat-social-links.ts`.
 *
 * Table écrite : `external_links`, avec `status = 'published'` et
 * `source = 'official'` (source institutionnelle : pas de modération).
 * Clé de rapprochement : official (via `an_id`) + plateforme, sans filtre
 * sur la source ni le statut.
 *
 * Idempotent : seule l'URL est réécrite si elle change (`captured_at`
 * rafraîchie). Le statut d'une ligne existante n'est jamais modifié. Les
 * députés sans fiche `officials` sont ignorés silencieusement.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { officials, externalLinks } from '@elupedia/shared';
import { eq } from 'drizzle-orm';
import type { SocialLinkData } from '../sources/an-reseaux-sociaux.js';

/**
 * Upsert des liens sociaux des députés. Écrit dans `external_links`.
 * Retourne le nombre de lignes créées et mises à jour.
 */
export async function upsertSocialLinks(
  db: NeonHttpDatabase,
  links: SocialLinkData[],
) {
  const summary = { created: 0, updated: 0 };

  const allOfficials = await db
    .select({ id: officials.id, anId: officials.anId })
    .from(officials);
  const officialByAnId = new Map<string, string>();
  for (const official of allOfficials) {
    if (official.anId) officialByAnId.set(official.anId, official.id);
  }

  const allLinks = await db
    .select({
      id: externalLinks.id,
      officialId: externalLinks.officialId,
      platform: externalLinks.platform,
      url: externalLinks.url,
    })
    .from(externalLinks);
  const existingByKey = new Map<string, { id: string; url: string }>();
  for (const link of allLinks) {
    existingByKey.set(`${link.officialId}|${link.platform}`, link);
  }

  const newRows: (typeof externalLinks.$inferInsert)[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const link of links) {
    const officialId = officialByAnId.get(link.anId);
    if (!officialId) continue;

    const existing = existingByKey.get(`${officialId}|${link.platform}`);

    if (!existing) {
      newRows.push({
        officialId,
        platform: link.platform,
        url: link.url,
        status: 'published',
        source: 'official',
        capturedAt: today,
      });
      summary.created++;
    } else if (existing.url !== link.url) {
      await db
        .update(externalLinks)
        .set({
          url: link.url,
          capturedAt: today,
          updatedAt: new Date(),
        })
        .where(eq(externalLinks.id, existing.id));
      summary.updated++;
    }
  }

  if (newRows.length > 0) {
    await db.insert(externalLinks).values(newRows);
  }

  return summary;
}
