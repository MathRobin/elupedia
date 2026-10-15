/**
 * Table `commune_transparency` : compteurs agrégés des demandes d'accès
 * aux documents administratifs (CADA) adressées à une mairie via
 * MaDada.fr. Une ligne par commune, clé = code INSEE.
 *
 * Alimentée par `madada.ts` (API JSON Alaveteli `/body/<url_name>.json`).
 * Le détail demande par demande est dans `madada_requests`. Affichée sur
 * la fiche du maire comme indicateur de transparence de sa commune.
 */
import {
  pgTable,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const communeTransparency = pgTable(
  'commune_transparency',
  {
    communeCode: varchar('commune_code', { length: 10 }).primaryKey(),
    // Slug de l'autorité publique sur madada.fr (`url_name` de l'API),
    // nécessaire pour reconstruire les liens et paginer les demandes.
    madadaUrlName: varchar('madada_url_name', { length: 255 }).notNull(),
    requestsCount: integer('requests_count').default(0).notNull(),
    requestsSuccessful: integer('requests_successful').default(0).notNull(),
    // Demandes hors délai légal de réponse (un mois).
    requestsOverdue: integer('requests_overdue').default(0).notNull(),
    // Demandes où l'administration a répondu ne pas détenir le document.
    requestsNotHeld: integer('requests_not_held').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('commune_transparency_madada_idx').on(table.madadaUrlName),
  ],
);
