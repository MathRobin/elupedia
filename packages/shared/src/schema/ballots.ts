import { pgTable, uuid, varchar, date } from 'drizzle-orm/pg-core';

export const ballots = pgTable('ballots', {
  id: uuid('id').defaultRandom().primaryKey(),
  anId: varchar('an_id', { length: 50 }).unique(),
  title: varchar('title', { length: 1024 }).notNull(),
  date: date('date').notNull(),
  type: varchar('type', { length: 100 }).notNull(),
});
