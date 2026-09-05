import {
  pgTable,
  uuid,
  varchar,
  date,
  integer,
  real,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const senatorialElections = pgTable(
  'senatorial_elections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    electionYear: varchar('election_year', { length: 4 }).notNull(),
    departementCode: varchar('departement_code', { length: 5 }).notNull(),
    departementName: varchar('departement_name', { length: 200 }),
    scrutinType: varchar('scrutin_type', { length: 20 }).notNull(),
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
  (t) => [
    uniqueIndex('senatorial_elections_year_dept_round_idx').on(
      t.electionYear,
      t.departementCode,
      t.round,
    ),
  ],
);

export const senatorialCandidates = pgTable(
  'senatorial_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => senatorialElections.id, { onDelete: 'cascade' }),
    nom: varchar('nom', { length: 200 }).notNull(),
    prenom: varchar('prenom', { length: 200 }).notNull(),
    sexe: varchar('sexe', { length: 2 }),
    nuance: varchar('nuance', { length: 20 }),
    voix: integer('voix').notNull(),
    ratioExprimes: real('ratio_exprimes'),
    elected: boolean('elected').notNull(),
    officialId: uuid('official_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('senatorial_candidates_election_name_idx').on(
      t.electionId,
      t.nom,
      t.prenom,
    ),
  ],
);
