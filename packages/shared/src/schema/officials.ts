import {
  pgTable,
  uuid,
  varchar,
  date,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';

export const officials = pgTable('officials', {
  id: uuid('id').defaultRandom().primaryKey(),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  anId: varchar('an_id', { length: 50 }).unique(),
  senatId: varchar('senat_id', { length: 50 }).unique(),
  birthDate: date('birth_date'),
  photoUrl: varchar('photo_url', { length: 1024 }),
  s3PhotoUrl: varchar('s3_photo_url', { length: 1024 }),
  deathDate: date('death_date'),
  slug: varchar('slug', { length: 512 }).unique(),
  full: jsonb('full'),
  hatvpStatus: varchar('hatvp_status', { length: 20 }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
