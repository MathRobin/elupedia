/**
 * Table `staffers` : collaborateurs parlementaires déclarés d'un élu.
 *
 * Alimentée par diff à chaque ingestion (`staffers-diff.ts` pour l'AN,
 * `senat-staffers-diff.ts` pour le Sénat) : un collaborateur absent de la
 * liste source est clôturé (`end_date`), pas supprimé. Pas d'identifiant
 * source, le matching se fait sur prénom + nom.
 */
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
