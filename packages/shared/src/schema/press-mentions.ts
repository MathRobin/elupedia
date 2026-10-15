/**
 * Table `press_mentions` : articles de presse citant un élu, collectés via
 * les flux RSS Google Actualités à partir de son nom complet.
 *
 * Alimentée par `google-news.ts` → `upsert/press-mentions.ts`, en deux
 * périmètres (parlementaires chaque semaine ; lots de maires/élus locaux
 * toutes les 5 h, ordonnés par `officials.press_checked_at`). Source non
 * officielle : homonymes et mentions indirectes possibles, pas
 * d'exhaustivité. Clé d'upsert logique : (official_id, source_url), sans
 * contrainte d'unicité SQL.
 */
import {
  pgTable,
  uuid,
  varchar,
  date,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const pressMentions = pgTable(
  'press_mentions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    officialId: uuid('official_id')
      .notNull()
      .references(() => officials.id),
    title: varchar('title', { length: 1024 }).notNull(),
    // Nom du média tel que donné par Google Actualités.
    sourceName: varchar('source_name', { length: 255 }).notNull(),
    sourceUrl: varchar('source_url', { length: 1024 }).notNull(),
    publishedDate: date('published_date').notNull(),
    summary: text('summary'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Vérifiée par upsertPressMentions à chaque mention ingérée (~1M lignes) :
    // sans cet index, chaque appel scannait la table entière. Créé
    // directement en base (CREATE INDEX CONCURRENTLY) plutôt que via
    // drizzle-kit migrate, le pipeline de migration étant cassé.
    index('press_mentions_official_source_idx').on(
      table.officialId,
      table.sourceUrl,
    ),
  ],
);
