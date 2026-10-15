/**
 * Table `ballot_group_positions` : position majoritaire et décompte des
 * voix de chaque groupe politique sur un scrutin (`ballots`).
 *
 * Alimentée par l'ingestion des scrutins AN (`positionMajoritaire` et
 * décompte par groupe dans le JSON source). Une ligne par (scrutin, organe).
 */
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
    // Identifiant de l'organe (groupe) dans l'open data AN, ex. PO800490.
    organeRef: varchar('organe_ref', { length: 50 }).notNull(),
    groupName: varchar('group_name', { length: 255 }).notNull(),
    // Position majoritaire du groupe, même vocabulaire que votePositionEnum.
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
  (table) => [
    uniqueIndex('ballot_group_positions_ballot_organe_idx').on(
      table.ballotId,
      table.organeRef,
    ),
  ],
);
