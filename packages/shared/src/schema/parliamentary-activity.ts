import { pgTable, uuid, varchar, date } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const activityTypeEnum = [
  'written_question',
  'oral_question',
  'amendment',
  'report',
] as const;

export const amendmentStatusEnum = [
  'adopted',
  'rejected',
  'withdrawn',
] as const;

export const parliamentaryActivity = pgTable('parliamentary_activity', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  type: varchar('type', { length: 50 }).notNull(),
  title: varchar('title', { length: 1024 }).notNull(),
  date: date('date').notNull(),
  status: varchar('status', { length: 20 }),
});
