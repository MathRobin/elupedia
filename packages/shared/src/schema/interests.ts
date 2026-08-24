import { pgTable, uuid, varchar, date, text, jsonb } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const interestTypeEnum = ['company_share', 'nonprofit_role'] as const;

export const interests = pgTable('interests', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  type: varchar('type', { length: 50 }).notNull(),
  entityName: varchar('entity_name', { length: 500 }).notNull(),
  roleDescription: text('role_description'),
  declaredDate: date('declared_date').notNull(),
  full: jsonb('full'),
});
