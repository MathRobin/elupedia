/**
 * Table `decorations` : décorations officielles (Légion d'honneur, Ordre
 * national du Mérite, Médaille militaire) attribuées à un élu.
 *
 * Alimentée par `legion-honneur.ts` depuis la base LUD (Liste Unique des
 * Décorés, archives.legiondhonneur.fr, moteur Arkothèque). Pour chaque
 * fiche `officials`, recherche par nom de famille puis filtre sur le
 * prénom : `official_id` est nullable mais les lignes sont en pratique
 * toujours rattachées. Les champs d'identité (nom, naissance, décès, lieu)
 * sont ceux de la fiche LUD, conservés pour contrôler le rattachement.
 */
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
    // Ordre (ex. « Légion d'honneur ») et grade (« Chevalier »...).
    orderName: varchar('order_name', { length: 255 }).notNull(),
    grade: varchar('grade', { length: 255 }).notNull(),
    decreeDate: date('decree_date'),
    journalOfficielDate: date('journal_officiel_date'),
    // Ministère proposant et « qualité » (fonction citée par le décret).
    ministry: varchar('ministry', { length: 512 }),
    quality: varchar('quality', { length: 512 }),
    // Référence de la fiche dans le moteur Arkothèque de la LUD.
    arkoRef: varchar('arko_ref', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Une fiche LUD peut porter plusieurs ordres : la clé d'upsert est le
    // couple (fiche, ordre).
    uniqueIndex('decorations_arko_ref_order_idx').on(
      table.arkoRef,
      table.orderName,
    ),
  ],
);
