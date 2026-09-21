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
  europarlId: varchar('europarl_id', { length: 50 }).unique(),
  birthDate: date('birth_date'),
  photoUrl: varchar('photo_url', { length: 1024 }),
  s3PhotoUrl: varchar('s3_photo_url', { length: 1024 }),
  deathDate: date('death_date'),
  slug: varchar('slug', { length: 512 }).unique(),
  full: jsonb('full'),
  hatvpStatus: varchar('hatvp_status', { length: 20 }),
  // Dernière fois où l'ingestion presse a vérifié cet élu (qu'un nouvel
  // article ait été trouvé ou non). Sert à prioriser le lot suivant
  // (ingest:press:maires) sur les élus jamais/plus anciennement vérifiés,
  // plutôt qu'un tirage aléatoire. Colonne ajoutée directement en base
  // (ALTER TABLE), le pipeline drizzle-kit migrate étant cassé.
  pressCheckedAt: timestamp('press_checked_at', { withTimezone: true }),
  // Dernière fois où l'ingestion fact-checks a interrogé cet élu (qu'un
  // signalement ait été trouvé ou non). Même logique que pressCheckedAt.
  factchecksCheckedAt: timestamp('factchecks_checked_at', {
    withTimezone: true,
  }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
