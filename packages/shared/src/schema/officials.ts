import { pgTable, uuid, varchar, date, jsonb } from 'drizzle-orm/pg-core';

export const officials = pgTable('officials', {
  id: uuid('id').defaultRandom().primaryKey(),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  anId: varchar('an_id', { length: 50 }).unique(),
  senatId: varchar('senat_id', { length: 50 }).unique(),
  birthDate: date('birth_date'),
  photoUrl: varchar('photo_url', { length: 1024 }),
  deathDate: date('death_date'),
  full: jsonb('full'),
});
