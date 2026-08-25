import { pgTable, uuid, varchar, date, text, jsonb } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const interestCategoryEnum = [
  'professional_activity',
  'consulting_activity',
  'governing_body_membership',
  'voluntary_activity',
  'elected_function',
  'financial_participation',
] as const;

export type InterestCategory = (typeof interestCategoryEnum)[number];

export const interests = pgTable('interests', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  category: varchar('category', { length: 50 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  entityName: varchar('entity_name', { length: 500 }).notNull(),
  roleDescription: text('role_description'),
  declaredDate: date('declared_date').notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  full: jsonb('full'),
});
