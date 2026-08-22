import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
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

export const externalLinks = pgTable('external_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  platform: varchar('platform', { length: 50 }).notNull(),
  url: varchar('url', { length: 1024 }).notNull(),
});
