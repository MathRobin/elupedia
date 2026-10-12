/**
 * Découverte des réseaux sociaux des maires à partir du site officiel de
 * leur mairie : sélectionne un lot de sites (lien 'official_page' posé par
 * `mayor-addresses.ts`), les scrape (`sources/personal-website-scraper.ts`)
 * et confie les liens trouvés à `scraped-links.ts`. Appelé par
 * `run-maires.ts` (étape 5).
 *
 * Table écrite : `external_links`, uniquement via upsertScrapedLinks (ce
 * module ne fait lui-même que du SELECT).
 * Sélection : BATCH_SIZE maires au plus par run, parmi ceux sans lien
 * instagram/tiktok/youtube, les sites capturés le plus anciennement (ou
 * sans date) d'abord. Un site scrapé sans résultat n'est pas mémorisé : il
 * reste éligible aux runs suivants tant qu'aucun de ces trois réseaux n'a
 * été trouvé.
 * Une erreur de scrape est comptée et n'interrompt pas le lot ; pause fixe
 * entre deux sites.
 */
import { sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { scrapePersonalWebsite } from '../sources/personal-website-scraper.js';
import { upsertScrapedLinks } from './scraped-links.js';
import { logger } from '../logger.js';

interface MayorScrapeCandidate {
  officialId: string;
  websiteUrl: string;
}

// Nombre max de sites scrapés par run.
const BATCH_SIZE = 100;
// Pause entre deux sites (politesse vis-à-vis des serveurs de mairies).
const DELAY_MS = 2000;

/**
 * Sélectionne les sites de mairie à scraper (lecture DB, SQL brut).
 * Retourne au plus BATCH_SIZE candidats (official + URL du site).
 */
export async function selectMayorWebsites(
  db: NeonHttpDatabase,
): Promise<MayorScrapeCandidate[]> {
  const result = await db.execute(sql`
    SELECT
      el.official_id,
      el.url AS website_url
    FROM external_links el
    JOIN mandates m ON m.official_id = el.official_id AND m.type = 'maire'
    WHERE el.platform = 'official_page'
      AND el.status = 'published'
      AND NOT EXISTS (
        SELECT 1 FROM external_links el2
        WHERE el2.official_id = el.official_id
          AND el2.platform IN ('instagram', 'tiktok', 'youtube')
      )
    ORDER BY el.captured_at ASC NULLS FIRST
    LIMIT ${BATCH_SIZE}
  `);

  return result.rows.map((row) => ({
    officialId: row.official_id as string,
    websiteUrl: row.website_url as string,
  }));
}

/**
 * Scrape les sites sélectionnés et enregistre les liens détectés (appels
 * réseau + écriture DB via upsertScrapedLinks). Retourne les liens créés,
 * ignorés (déjà connus) et le nombre de sites en erreur.
 */
export async function scrapeMayorWebsites(
  db: NeonHttpDatabase,
  fetchFn = globalThis.fetch,
): Promise<{ created: number; skipped: number; errors: number }> {
  const candidates = await selectMayorWebsites(db);
  logger.info(`  Mayor websites to scrape: ${candidates.length}`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    try {
      const links = await scrapePersonalWebsite(candidate.websiteUrl, fetchFn);
      const upsertResult = await upsertScrapedLinks(
        db,
        candidate.officialId,
        links,
      );
      created += upsertResult.created;
      skipped += upsertResult.skipped;
    } catch (error) {
      logger.warn(`  Scrape failed for ${candidate.websiteUrl}: ${error}`);
      errors++;
    }

    if (i < candidates.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  logger.info(
    `Mayor website scrape: ${created} links created, ${skipped} skipped, ${errors} errors`,
  );
  return { created, skipped, errors };
}
