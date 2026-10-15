/**
 * Table `votes` : position d'un élu sur un scrutin de `ballots`.
 *
 * Alimentée par les upserts de scrutins AN, Sénat et Parlement européen,
 * avec traduction des libellés source en anglais (`votePositionEnum`).
 * Pour le Parlement européen, seules les positions publiées (pour/contre/
 * abstention) sont enregistrées ; aucune ligne 'absent' n'est déduite.
 */
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
  // Numéro de siège dans l'hémicycle (`numPlace` AN), pour la
  // visualisation ; null hors AN.
  seatNumber: integer('seat_number'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
