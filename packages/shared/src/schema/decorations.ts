import {
  pgTable,
  uuid,
  varchar,
  date,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const decorations = pgTable(
  'decorations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    officialId: uuid('official_id').references(() => officials.id),
    lastName: varchar('last_name', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 255 }),
    sex: varchar('sex', { length: 10 }),
    birthDate: date('birth_date'),
    deathDate: date('death_date'),
    birthPlace: varchar('birth_place', { length: 512 }),
    orderName: varchar('order_name', { length: 255 }).notNull(),
    grade: varchar('grade', { length: 255 }).notNull(),
    decreeDate: date('decree_date'),
    journalOfficielDate: date('journal_officiel_date'),
    ministry: varchar('ministry', { length: 512 }),
    quality: varchar('quality', { length: 512 }),
    arkoRef: varchar('arko_ref', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('decorations_arko_ref_order_idx').on(t.arkoRef, t.orderName),
  ],
);
