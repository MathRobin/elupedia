import { pgTable, uuid, varchar, date, timestamp } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const committeeTypeEnum = [
  'standing_committee',
  'special_committee',
  'delegation',
  'study_group',
  'friendship_group',
] as const;

export const committees = pgTable('committees', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  name: varchar('name', { length: 500 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  // Identifiant de l'organe dans l'open data de l'Assemblée nationale (ex. PO854288),
  // qui permet de reconstruire l'URL de la fiche d'instance. Null pour le Sénat.
  anUid: varchar('an_uid', { length: 20 }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
