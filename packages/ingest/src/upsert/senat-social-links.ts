/**
 * Upsert des liens réseaux sociaux officiels des sénateurs (open data Sénat,
 * `sources/senat-reseaux-sociaux.ts`), appelé par `run-senat.ts`
 * (`ingest:senat`).
 *
 * Table écrite : `external_links`, avec `status = 'published'` et
 * `source = 'official'` (source institutionnelle : pas de modération, à la
 * différence des liens scrapés de `upsert/scraped-links.ts`).
 * Clé de rapprochement : official (via `senat_id` = matricule, trimé) +
 * plateforme, sans filtre sur la source.
 *
 * Idempotent : seule l'URL est réécrite si elle change (`captured_at`
 * rafraîchie). Le statut d'une ligne existante n'est jamais modifié.
 */
import { type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import {
  officials,
  externalLinks,
  normalizeExternalLinkUrl,
} from '@elupedia/shared';
import { eq, and } from 'drizzle-orm';
import type { SenatSocialLinkData } from '../sources/senat-reseaux-sociaux.js';
import { logger } from '../logger.js';

/**
 * Upsert des liens sociaux sénatoriaux. Écrit dans `external_links`.
 * Retourne créés / mis à jour / ignorés (sénateur sans fiche).
 */
export async function upsertSenatSocialLinks(
  db: NeonHttpDatabase,
  links: SenatSocialLinkData[],
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

  for (const link of links) {
    const officialId = officialByMatricule.get(link.matricule.trim());
    if (!officialId) {
      summary.skipped++;
      continue;
    }

    const existing = await db
      .select({ id: externalLinks.id, url: externalLinks.url })
      .from(externalLinks)
      .where(
        and(
          eq(externalLinks.officialId, officialId),
          eq(externalLinks.platform, link.platform),
        ),
      )
      .limit(1);

    const url = normalizeExternalLinkUrl(link.url);
    if (existing.length === 0) {
      await db.insert(externalLinks).values({
        officialId,
        platform: link.platform,
        url,
        status: 'published',
        source: 'official',
        capturedAt: new Date().toISOString().slice(0, 10),
      });
      summary.created++;
    } else if (existing[0].url !== url) {
      await db
        .update(externalLinks)
        .set({
          url,
          capturedAt: new Date().toISOString().slice(0, 10),
          updatedAt: new Date(),
        })
        .where(eq(externalLinks.id, existing[0].id));
      summary.updated++;
    }
  }

  logger.info(
    `Sénat social links: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`,
  );
  return summary;
}
