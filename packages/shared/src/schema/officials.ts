/**
 * Table `officials` : une fiche par personne élue, pivot de toute la base
 * (les autres tables pointent vers `officials.id`).
 *
 * Alimentée par plusieurs ingestions qui se rattachent à une même fiche via
 * les identifiants source (`an_id`, `senat_id`, `europarl_id`) ou, pour les
 * sources sans identifiant (RNE, Wikidata, parrainages...), par nom
 * normalisé + date de naissance. Une personne cumulant ou enchaînant des
 * mandats n'a qu'une seule ligne ici et plusieurs lignes `mandates`.
 *
 * `slug` est le permalink public (`/elus/{slug}`), généré à l'insertion par
 * `slugifyText`, suffixé `-1`, `-2`... pour les homonymes : ne jamais le
 * recalculer sur une fiche existante.
 */
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
  // Identifiants dans les open data respectifs (ex. AN « PA123456 »).
  // Nullables : un maire issu du RNE n'en a aucun.
  anId: varchar('an_id', { length: 50 }).unique(),
  senatId: varchar('senat_id', { length: 50 }).unique(),
  europarlId: varchar('europarl_id', { length: 50 }).unique(),
  birthDate: date('birth_date'),
  // URL d'origine de la photo (AN, Sénat, Wikidata...) et sa copie S3 ;
  // le site privilégie `s3_photo_url` pour ne pas dépendre de la source.
  photoUrl: varchar('photo_url', { length: 1024 }),
  s3PhotoUrl: varchar('s3_photo_url', { length: 1024 }),
  deathDate: date('death_date'),
  slug: varchar('slug', { length: 512 }).unique(),
  // Enregistrement source brut (JSON AN ou Sénat) conservé tel quel pour
  // les champs non modélisés.
  full: jsonb('full'),
  // 'pending' quand une déclaration HATVP est déposée mais pas encore
  // publiée (bandeau sur la fiche), null sinon. Posé par hatvp-status.
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
