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
    // Nullables : le résultat n'existe pas tant que le scrutin n'a pas eu
    // lieu. La ligne est créée dès la publication des candidatures (voir
    // upsert/senat-candidacies.ts) puis complétée par l'ingestion
    // rétrospective des résultats (upsert/senatorial-elections.ts), qui
    // ciblent la même clé unique (electionYear, departementCode, round).
    inscrits: integer('inscrits'),
    abstentions: integer('abstentions'),
    votants: integer('votants'),
    blancs: integer('blancs'),
    nuls: integer('nuls'),
    exprimes: integer('exprimes'),
    siegesAPourvoir: integer('sieges_a_pourvoir'),
    electeursSenatoriaux: integer('electeurs_senatoriaux'),
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
    // Note : 150 (au lieu du code court à 3 lettres des ingestions
    // rétrospectives, ex. "LR") pour accueillir les libellés complets
    // attribués par les préfets pour les candidatures 2026 (ex. "Liste
    // des Républicains", "Union des droites pour la République").
    nuance: varchar('nuance', { length: 150 }),
    // Nom de la liste (scrutin proportionnel uniquement) ; null en
    // scrutin majoritaire où les candidats se présentent individuellement.
    liste: varchar('liste', { length: 500 }),
    // Sénateur sortant qui se représente, tel qu'indiqué par la source.
    sortant: boolean('sortant').notNull().default(false),
    // Nullables tant que le scrutin n'a pas eu lieu (simple candidature).
    voix: integer('voix'),
    ratioExprimes: real('ratio_exprimes'),
    elected: boolean('elected'),
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
