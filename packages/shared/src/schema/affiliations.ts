import { pgTable, uuid, varchar, date, timestamp } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const affiliations = pgTable('affiliations', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  partyOrGroup: varchar('party_or_group', { length: 255 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
