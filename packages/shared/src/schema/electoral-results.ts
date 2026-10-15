/**
 * Table `electoral_results` : résumé du score d'un élu à une élection
 * (pourcentage, tour, nombre d'adversaires), pour la frise « Historique
 * électoral » de la fiche.
 *
 * Alimentée aujourd'hui uniquement par `senat-elections.ts` →
 * `senat-electoral-results.ts` (CSV data.gouv.fr, `election_type` =
 * 'sénatoriales'). La source AN (`datagouv-elections.ts`) est prévue mais
 * pas câblée. Les résultats complets par commune/candidat sont dans les
 * tables `*_elections` / `*_candidates`, pas ici.
 */
import {
  pgTable,
  uuid,
  varchar,
  date,
  integer,
  real,
  timestamp,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const electoralResults = pgTable('electoral_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  electionType: varchar('election_type', { length: 100 }).notNull(),
  electionDate: date('election_date').notNull(),
  round: integer('round').notNull(),
  scorePercent: real('score_percent').notNull(),
  opponentCount: integer('opponent_count').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
