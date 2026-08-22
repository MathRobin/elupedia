import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const addressTypeEnum = [
  'constituency_office',
  'assembly_office',
] as const;

export const addresses = pgTable('addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  type: varchar('type', { length: 50 }).notNull(),
  street: varchar('street', { length: 500 }),
  postalCode: varchar('postal_code', { length: 20 }),
  city: varchar('city', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
});
