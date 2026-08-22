import { pgTable, uuid, varchar, date } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const mandates = pgTable('mandates', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  type: varchar('type', { length: 100 }).notNull(),
  district: varchar('district', { length: 255 }),
  department: varchar('department', { length: 255 }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  politicalGroup: varchar('political_group', { length: 255 }),
});
