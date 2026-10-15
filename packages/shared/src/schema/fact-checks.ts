/**
 * Table `fact_checks` : vérifications de faits (ClaimReview) citant un élu,
 * trouvées dans l'index Google Fact Check Tools.
 *
 * Alimentée par `google-factcheck.ts` → `upsert/fact-checks.ts`, qui
 * interroge l'API par nom complet de l'élu (quota 10 000 req/jour, suivi
 * par `officials.factchecks_checked_at`). Comme pour la presse, la
 * recherche par nom peut ramener des homonymes : section affichée à titre
 * informatif. Les champs reprennent le vocabulaire schema.org ClaimReview.
 */
import {
  pgTable,
  uuid,
  varchar,
  date,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const factChecks = pgTable('fact_checks', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  claimReviewed: text('claim_reviewed').notNull(),
  reviewUrl: varchar('review_url', { length: 2048 }).notNull(),
  reviewerName: varchar('reviewer_name', { length: 255 }).notNull(),
  reviewerUrl: varchar('reviewer_url', { length: 2048 }),
  // Verdict textuel libre du vérificateur (« Faux », « Trompeur »...).
  rating: varchar('rating', { length: 100 }),
  datePublished: date('date_published'),
  languageCode: varchar('language_code', { length: 10 })
    .notNull()
    .default('fr'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
