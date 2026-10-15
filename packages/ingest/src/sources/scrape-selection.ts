/**
 * Sélection des élus dont le site personnel doit être (re)scrapé pour y
 * découvrir des réseaux sociaux manquants (étape « personal-website-scrape »
 * de run-social-links.ts, ticket #133).
 *
 * Source : la table external_links elle-même. Un élu est candidat s'il a un
 * lien `personal_website` publié et qu'il lui manque au moins un des liens
 * instagram / tiktok / youtube publiés. Les jamais-scrapés passent en premier
 * (captured_at NULL), puis les plus anciens, par lots de BATCH_SIZE : chaque
 * run avance d'un lot, le tour complet se fait sur plusieurs exécutions.
 *
 * Piège : `captured_at` du lien personal_website sert ici d'horodatage de
 * dernier scrape (updateLastScrapedAt l'écrase à aujourd'hui), ce n'est pas
 * la date de découverte du lien.
 */
import { sql, eq, and } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { externalLinks } from '@elupedia/shared';

/** Nombre d'élus traités par exécution (le scraping est lent et distant). */
const BATCH_SIZE = 50;

export interface ScrapeCandidate {
  officialId: string;
  websiteUrl: string;
}

/**
 * Lit en base les BATCH_SIZE prochains élus à scraper (lecture seule).
 * Les plateformes manquantes ne sont pas retournées : le scraper les
 * redécouvre toutes et l'upsert dédoublonne.
 */
export async function selectOfficialsToScrape(
  db: NeonHttpDatabase,
): Promise<ScrapeCandidate[]> {
  const rows = await db.execute(sql`
    SELECT
      ws.official_id,
      ws.url AS website_url,
      ws.captured_at
    FROM external_links ws
    WHERE ws.platform = 'personal_website'
      AND ws.status = 'published'
      AND (
        NOT EXISTS (
          SELECT 1 FROM external_links el
          WHERE el.official_id = ws.official_id
            AND el.platform = 'instagram'
            AND el.status = 'published'
        )
        OR NOT EXISTS (
          SELECT 1 FROM external_links el
          WHERE el.official_id = ws.official_id
            AND el.platform = 'tiktok'
            AND el.status = 'published'
        )
        OR NOT EXISTS (
          SELECT 1 FROM external_links el
          WHERE el.official_id = ws.official_id
            AND el.platform = 'youtube'
            AND el.status = 'published'
        )
      )
    ORDER BY ws.captured_at ASC NULLS FIRST
    LIMIT ${BATCH_SIZE}
  `);

  return rows.rows.map((row) => ({
    officialId: row.official_id as string,
    websiteUrl: row.website_url as string,
  }));
}

/**
 * Marque le site personnel d'un élu comme scrapé aujourd'hui (écriture DB :
 * met à jour captured_at de son lien personal_website), ce qui le renvoie en
 * fin de file pour les prochains runs.
 */
export async function updateLastScrapedAt(
  db: NeonHttpDatabase,
  officialId: string,
): Promise<void> {
  await db
    .update(externalLinks)
    .set({ capturedAt: new Date().toISOString().slice(0, 10) })
    .where(
      and(
        eq(externalLinks.officialId, officialId),
        eq(externalLinks.platform, 'personal_website'),
      ),
    );
}
