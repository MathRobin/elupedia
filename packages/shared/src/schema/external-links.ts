/**
 * Table `external_links` : liens externes d'un élu (réseaux sociaux,
 * Wikipédia, site officiel ou personnel, page MaDada de sa commune).
 *
 * Trois origines, distinguées par `source` : les liens déclarés par les
 * assemblées (`an-reseaux-sociaux.ts`, `senat-reseaux-sociaux.ts`,
 * publiés directement), ceux trouvés en scrapant le site personnel
 * (`personal-website-scraper.ts`, créés en `pending` et soumis à la
 * modération de l'admin) et ceux issus de l'API Wikipédia.
 *
 * Le site n'affiche que `status = 'published'`. Un lien `rejected` ou
 * `deleted` est conservé pour que le scraper ne le re-propose pas.
 */
import { pgTable, uuid, varchar, date, timestamp } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

/** Valeurs attendues de `external_links.platform` (varchar libre). */
export const platformEnum = [
  'twitter',
  'facebook',
  'instagram',
  'youtube',
  'tiktok',
  'wikipedia_fr',
  'official_page',
  'personal_website',
  'madada',
] as const;

/** Cycle de modération : pending → published | rejected ; deleted a posteriori. */
export const linkStatusEnum = [
  'pending',
  'published',
  'deleted',
  'rejected',
] as const;

/** Origine du lien (voir en-tête). */
export const linkSourceEnum = [
  'official',
  'scraped_personal_website',
  'wikipedia_api',
] as const;

export const externalLinks = pgTable('external_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  platform: varchar('platform', { length: 50 }).notNull(),
  url: varchar('url', { length: 1024 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('published'),
  source: varchar('source', { length: 50 }).notNull().default('official'),
  // Date du scraping qui a produit le lien ; null pour les liens officiels.
  capturedAt: date('captured_at'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
