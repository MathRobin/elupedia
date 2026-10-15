/**
 * Table `madada_requests` : chaque demande d'accès aux documents
 * administratifs (CADA) adressée à une mairie sur MaDada.fr, avec sa date
 * de création — ce que les agrégats de `commune_transparency` ne
 * permettent pas : filtrer les demandes sur la période de mandat du maire.
 *
 * Alimentée par `madada-requests.ts` (scraping des pages paginées
 * `/body/<url_name>` puis API JSON `/request/<slug>.json`). La clé primaire
 * est l'identifiant MaDada lui-même ; `created_at`/`updated_at` sont ceux
 * de la demande côté MaDada, pas des timestamps Elupedia.
 */
import {
  pgTable,
  varchar,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const madadaRequests = pgTable(
  'madada_requests',
  {
    madadaId: integer('madada_id').primaryKey(),
    communeCode: varchar('commune_code', { length: 10 }).notNull(),
    // Slug de la demande sur madada.fr (`/request/<url_title>`).
    urlTitle: varchar('url_title', { length: 512 }).notNull(),
    title: varchar('title', { length: 1024 }).notNull(),
    // Statut Alaveteli brut (`described_state`, ex. 'successful',
    // 'waiting_response'), 'unknown' à défaut.
    status: varchar('status', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('madada_requests_commune_created_idx').on(
      table.communeCode,
      table.createdAt,
    ),
  ],
);
