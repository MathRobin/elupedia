import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { ballots } from './ballots.js';
import { officials } from './officials.js';

export const votePositionEnum = [
  'for',
  'against',
  'abstain',
  'absent',
] as const;

export const votes = pgTable('votes', {
  id: uuid('id').defaultRandom().primaryKey(),
  ballotId: uuid('ballot_id')
    .notNull()
    .references(() => ballots.id),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  position: varchar('position', { length: 20 }).notNull(),
  seatNumber: integer('seat_number'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
