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
  rating: text('rating'),
  datePublished: date('date_published'),
  languageCode: varchar('language_code', { length: 10 })
    .notNull()
    .default('fr'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
