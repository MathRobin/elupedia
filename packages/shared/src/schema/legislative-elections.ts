/**
 * Tables `legislative_elections` / `legislative_candidates` : résultats
 * détaillés des élections législatives, par commune et par tour, avec le
 * score de chaque candidat.
 *
 * Alimentées par `sources/legislative-elections.ts` (CSV data.gouv.fr du
 * ministère de l'Intérieur) → `upsert/legislative-elections.ts`. Les noms
 * de colonnes de dépouillement sont volontairement ceux du vocabulaire
 * électoral français (inscrits, votants, exprimés, nuance, panneau) pour
 * rester alignés sur la source. Même structure que `municipal-elections.ts`
 * et, à quelques colonnes près, `senatorial-elections.ts`.
 *
 * `legislative_candidates.official_id` est posé a posteriori par
 * `reconcile` (matching par nom normalisé), sans clé étrangère.
 */
import {
  pgTable,
  uuid,
  varchar,
  date,
  integer,
  real,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const legislativeElections = pgTable(
  'legislative_elections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Identifiant maison de l'élection et du tour, ex. '2024_legi_t2'
    // (voir ELECTION_DATES dans l'ingest).
    electionId: varchar('election_id', { length: 30 }).notNull(),
    departementCode: varchar('departement_code', { length: 5 }).notNull(),
    communeCode: varchar('commune_code', { length: 10 }).notNull(),
    communeName: varchar('commune_name', { length: 200 }),
    round: integer('round').notNull(),
    electionDate: date('election_date').notNull(),
    inscrits: integer('inscrits').notNull(),
    abstentions: integer('abstentions').notNull(),
    votants: integer('votants').notNull(),
    blancs: integer('blancs').notNull(),
    nuls: integer('nuls').notNull(),
    exprimes: integer('exprimes').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('legislative_elections_election_commune_idx').on(
      table.electionId,
      table.communeCode,
    ),
  ],
);

export const legislativeCandidates = pgTable(
  'legislative_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => legislativeElections.id, { onDelete: 'cascade' }),
    // Numéro de panneau d'affichage : identifie le candidat dans la
    // circonscription pour ce tour, d'où son rôle dans la clé unique.
    panneau: integer('panneau').notNull(),
    nom: varchar('nom', { length: 200 }).notNull(),
    prenom: varchar('prenom', { length: 200 }).notNull(),
    sexe: varchar('sexe', { length: 2 }),
    // Nuance politique attribuée par le ministère (code court, ex. 'RN').
    nuance: varchar('nuance', { length: 20 }),
    voix: integer('voix').notNull(),
    ratioInscrits: real('ratio_inscrits'),
    ratioExprimes: real('ratio_exprimes'),
    officialId: uuid('official_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('legislative_candidates_election_panneau_idx').on(
      table.electionId,
      table.panneau,
    ),
  ],
);
