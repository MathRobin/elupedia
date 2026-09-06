import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { ballots } from './ballots.js';

export const ballotGroupPositions = pgTable(
  'ballot_group_positions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ballotId: uuid('ballot_id')
      .notNull()
      .references(() => ballots.id),
    organeRef: varchar('organe_ref', { length: 50 }).notNull(),
    groupName: varchar('group_name', { length: 255 }).notNull(),
    position: varchar('position', { length: 20 }).notNull(),
    memberCount: integer('member_count'),
    votesFor: integer('votes_for').default(0).notNull(),
    votesAgainst: integer('votes_against').default(0).notNull(),
    votesAbstain: integer('votes_abstain').default(0).notNull(),
    votesAbsent: integer('votes_absent').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('ballot_group_positions_ballot_organe_idx').on(
      t.ballotId,
      t.organeRef,
    ),
  ],
);
