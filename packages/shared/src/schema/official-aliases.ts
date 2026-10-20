/**
 * Table `official_aliases` : identités alternatives d'une fiche élu, pour que
 * les ingestions qui rapprochent par nom + prénom + date de naissance (RNE :
 * maires, conseillers départementaux, régionaux, communautaires, etc.)
 * retrouvent la bonne fiche quand une source écrit la personne autrement
 * (année de naissance erronée dans un fichier RNE, prénom composé tronqué…).
 *
 * Alimentée par les fusions de doublons (admin « Doublons », fusion CLI) et
 * à la main depuis la fiche élu de l'admin. `alias_key` est la clé normalisée
 * des upserts (`officialAliasKey` dans `official-alias-key.ts`) ; une clé ne
 * peut pointer que vers une fiche. Supprimée avec la fiche (cascade).
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const officialAliasSources = [
  'admin_merge',
  'admin_manual',
  'cli_merge',
] as const;
export type OfficialAliasSource = (typeof officialAliasSources)[number];

export const officialAliases = pgTable(
  'official_aliases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    officialId: uuid('official_id')
      .notNull()
      .references(() => officials.id, { onDelete: 'cascade' }),
    firstName: varchar('first_name', { length: 255 }).notNull(),
    lastName: varchar('last_name', { length: 255 }).notNull(),
    birthDate: date('birth_date'),
    /** Clé normalisée prénom|nom|date, celle des upserts (`officialAliasKey`). */
    aliasKey: text('alias_key').notNull().unique(),
    source: varchar('source', { length: 50 }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('official_aliases_official_id_idx').on(table.officialId)],
);
