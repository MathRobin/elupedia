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
  (t) => [
    uniqueIndex('legislative_elections_election_commune_idx').on(
      t.electionId,
      t.communeCode,
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
    panneau: integer('panneau').notNull(),
    nom: varchar('nom', { length: 200 }).notNull(),
    prenom: varchar('prenom', { length: 200 }).notNull(),
    sexe: varchar('sexe', { length: 2 }),
    nuance: varchar('nuance', { length: 20 }),
    voix: integer('voix').notNull(),
    ratioInscrits: real('ratio_inscrits'),
    ratioExprimes: real('ratio_exprimes'),
    officialId: uuid('official_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('legislative_candidates_election_panneau_idx').on(
      t.electionId,
      t.panneau,
    ),
  ],
);
