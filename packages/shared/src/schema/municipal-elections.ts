/**
 * Tables `municipal_elections` / `municipal_candidates` : résultats
 * détaillés des élections municipales, par commune et par tour, avec le
 * score de chaque candidat ou tête de liste.
 *
 * Alimentées par `sources/municipal-elections.ts` (CSV data.gouv.fr du
 * ministère de l'Intérieur) → `upsert/municipal-elections.ts`. Même
 * structure que `legislative-elections.ts` (voir son en-tête pour le
 * vocabulaire des colonnes), plus `liste` pour le scrutin de liste des
 * communes de 1 000 habitants et plus.
 *
 * `municipal_candidates.official_id` est posé a posteriori par `reconcile`
 * (matching par nom normalisé), sans clé étrangère.
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

export const municipalElections = pgTable(
  'municipal_elections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Identifiant maison de l'élection et du tour, ex. '2020_muni_t1'.
    electionId: varchar('election_id', { length: 30 }).notNull(),
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
    uniqueIndex('municipal_elections_election_commune_idx').on(
      table.electionId,
      table.communeCode,
    ),
  ],
);

export const municipalCandidates = pgTable(
  'municipal_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => municipalElections.id, { onDelete: 'cascade' }),
    // Numéro de panneau d'affichage, identifiant du candidat/de la liste
    // dans la commune pour ce tour.
    panneau: integer('panneau').notNull(),
    nom: varchar('nom', { length: 200 }).notNull(),
    prenom: varchar('prenom', { length: 200 }).notNull(),
    sexe: varchar('sexe', { length: 2 }),
    nuance: varchar('nuance', { length: 20 }),
    // Intitulé de la liste ; null pour les petites communes (scrutin
    // plurinominal sans liste).
    liste: varchar('liste', { length: 500 }),
    voix: integer('voix').notNull(),
    ratioInscrits: real('ratio_inscrits'),
    ratioExprimes: real('ratio_exprimes'),
    officialId: uuid('official_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('municipal_candidates_election_panneau_idx').on(
      table.electionId,
      table.panneau,
    ),
  ],
);
