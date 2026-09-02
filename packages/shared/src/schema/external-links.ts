import { pgTable, uuid, varchar, date, timestamp } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

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

export const linkStatusEnum = [
  'pending',
  'published',
  'deleted',
  'rejected',
] as const;

export const linkSourceEnum = ['official', 'scraped_personal_website'] as const;

export const externalLinks = pgTable('external_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  platform: varchar('platform', { length: 50 }).notNull(),
  url: varchar('url', { length: 1024 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('published'),
  source: varchar('source', { length: 50 }).notNull().default('official'),
  capturedAt: date('captured_at'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
