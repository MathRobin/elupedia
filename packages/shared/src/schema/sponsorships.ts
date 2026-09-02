import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  date,
  timestamp,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const sponsorships = pgTable('sponsorships', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id').references(() => officials.id),
  type: varchar('type', { length: 50 }).notNull(),
  electionYear: integer('election_year').notNull(),
  candidateName: varchar('candidate_name', { length: 255 }).notNull(),
  rawElectedName: varchar('raw_elected_name', { length: 255 }).notNull(),
  rawFunction: varchar('raw_function', { length: 255 }).notNull(),
  rawCircumscription: varchar('raw_circumscription', { length: 255 }),
  rawDepartment: varchar('raw_department', { length: 255 }),
  publicationDate: date('publication_date'),
  matched: boolean('matched').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
