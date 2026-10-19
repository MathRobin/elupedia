/**
 * Tables `senatorial_elections` / `senatorial_candidates` : résultats des
 * élections sénatoriales par département et par tour, avec le score de
 * chaque candidat. Les sénateurs étant élus au suffrage indirect, la
 * granularité est le département, pas la commune.
 *
 * Deux ingestions écrivent dans ces tables, en ciblant la même clé unique
 * (election_year, departement_code, round) :
 * - rétrospective : `sources/datagouv-elections.ts` →
 *   `upsert/senatorial-elections.ts` (CSV data.gouv.fr) ;
 * - scrutin 2026 : `senat-candidacies-2026.ts` crée les lignes dès la
 *   publication des candidatures (résultats null), puis
 *   `senat-resultats-2026.ts` les complète après le scrutin.
 * D'où des colonnes de dépouillement nullables, contrairement à
 * `legislative-elections.ts` / `municipal-elections.ts`.
 *
 * `senatorial_candidates.official_id` est posé par `reconcile` ou par
 * `senat-mandats-2026.ts`, sans clé étrangère.
 */
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
    // 'majoritaire' (1 ou 2 sièges, deux tours possibles) ou
    // 'proportionnel' (3 sièges et plus, tour unique, scrutin de liste).
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
    // Taille du collège électoral (grands électeurs) du département.
    electeursSenatoriaux: integer('electeurs_senatoriaux'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('senatorial_elections_year_dept_round_idx').on(
      table.electionYear,
      table.departementCode,
      table.round,
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
    // Verdict de `reconcile` si official_id est null ('no_match' /
    // 'ambiguous', voir reconciliationResolutionEnum dans sponsorships.ts).
    resolution: varchar('resolution', { length: 20 }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Pas de numéro de panneau pour les sénatoriales : la clé d'upsert est
    // le nom complet dans le département. Deux homonymes parfaits dans un
    // même scrutin se téléscoperaient.
    uniqueIndex('senatorial_candidates_election_name_idx').on(
      table.electionId,
      table.nom,
      table.prenom,
    ),
  ],
);
