/**
 * Insertion des liens (réseaux sociaux, sites) détectés en scrapant le site
 * personnel d'un élu (`sources/personal-website-scraper.ts`), appelé par
 * `run-social-links.ts` (`ingest:social-links`).
 *
 * Table écrite : `external_links`, toujours avec `status = 'pending'` (à
 * valider manuellement) et `source = 'scraped_personal_website'`.
 * Clé de rapprochement : official + plateforme.
 *
 * Insert-only : une plateforme déjà présente pour l'official, quel que soit
 * son statut (publié, en attente, rejeté, supprimé), n'est jamais réinsérée,
 * pour ne pas écraser une décision de modération ni créer de doublon.
 *
 * Attention : `scraped-links.test.ts` vérifie le texte source de ce fichier
 * (littéraux `status: 'pending'`, `capturedAt: today`, etc.).
 */
import { eq, and, inArray } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { externalLinks, normalizeExternalLinkUrl } from '@elupedia/shared';
import type { DetectedLink } from '../sources/personal-website-scraper.js';

/**
 * Insère en `pending` les liens dont la plateforme n'existe pas encore pour
 * cet official. Écrit dans `external_links`. Retourne créés / ignorés.
 */
export async function upsertScrapedLinks(
  db: NeonHttpDatabase,
  officialId: string,
  links: DetectedLink[],
): Promise<{ created: number; skipped: number }> {
  if (links.length === 0) return { created: 0, skipped: 0 };

  const platforms = links.map((link) => link.platform);

  const existing = await db
    .select({
      platform: externalLinks.platform,
      status: externalLinks.status,
    })
    .from(externalLinks)
    .where(
      and(
        eq(externalLinks.officialId, officialId),
        inArray(externalLinks.platform, platforms),
      ),
    );

  // Tous les statuts connus sont exclus : la liste est explicite plutôt
  // qu'un « tout sauf » pour qu'un futur statut soit traité sciemment.
  const excludedPlatforms = new Set(
    existing
      .filter(
        (row) =>
          row.status === 'rejected' ||
          row.status === 'deleted' ||
          row.status === 'published' ||
          row.status === 'pending',
      )
      .map((row) => row.platform),
  );

  const toInsert = links.filter(
    (link) => !excludedPlatforms.has(link.platform),
  );

  const today = new Date().toISOString().slice(0, 10);

  for (const link of toInsert) {
    await db.insert(externalLinks).values({
      officialId,
      platform: link.platform,
      url: normalizeExternalLinkUrl(link.url),
      status: 'pending',
      source: 'scraped_personal_website',
      capturedAt: today,
    });
  }

  return { created: toInsert.length, skipped: links.length - toInsert.length };
}
