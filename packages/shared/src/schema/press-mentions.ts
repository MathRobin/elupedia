import { pgTable, uuid, varchar, date, text } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const pressMentions = pgTable('press_mentions', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  title: varchar('title', { length: 1024 }).notNull(),
  sourceName: varchar('source_name', { length: 255 }).notNull(),
  sourceUrl: varchar('source_url', { length: 1024 }).notNull(),
  publishedDate: date('published_date').notNull(),
  summary: text('summary'),
});
