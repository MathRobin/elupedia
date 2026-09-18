import {
  pgTable,
  uuid,
  varchar,
  date,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const mandates = pgTable(
  'mandates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    officialId: uuid('official_id')
      .notNull()
      .references(() => officials.id),
    type: varchar('type', { length: 100 }).notNull(),
    district: varchar('district', { length: 255 }),
    department: varchar('department', { length: 255 }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    politicalGroup: varchar('political_group', { length: 255 }),
    // Numéro de législature (ex. 10 pour le Parlement européen 2024-2029). Non renseigné pour AN/Sénat, où les dates suffisent.
    legislature: integer('legislature'),
    communeCode: varchar('commune_code', { length: 10 }),
    parentCommuneCode: varchar('parent_commune_code', { length: 10 }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('mandates_official_type_start_idx').on(
      t.officialId,
      t.type,
      t.startDate,
    ),
  ],
);
