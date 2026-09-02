import {
  pgTable,
  uuid,
  varchar,
  date,
  index,
  timestamp,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const staffers = pgTable(
  'staffers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    officialId: uuid('official_id')
      .notNull()
      .references(() => officials.id),
    firstName: varchar('first_name', { length: 255 }).notNull(),
    lastName: varchar('last_name', { length: 255 }).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('staffers_official_id_idx').on(table.officialId)],
);
