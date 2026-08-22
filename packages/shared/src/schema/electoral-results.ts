import {
  pgTable,
  uuid,
  varchar,
  date,
  integer,
  real,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const electoralResults = pgTable('electoral_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  electionType: varchar('election_type', { length: 100 }).notNull(),
  electionDate: date('election_date').notNull(),
  round: integer('round').notNull(),
  scorePercent: real('score_percent').notNull(),
  opponentCount: integer('opponent_count').notNull(),
});
