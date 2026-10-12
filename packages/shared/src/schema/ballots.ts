/**
 * Table `ballots` : un scrutin public (vote nominatif) d'une assemblée.
 * Les positions individuelles sont dans `votes`, celles des groupes dans
 * `ballot_group_positions`.
 *
 * Alimentée par les scrutins AN (`an-scrutins.ts`), Sénat (`senat-scrutins.ts`)
 * et Parlement européen (`parlement-europeen-votes.ts`, votes par appel
 * nominal uniquement).
 */
import { pgTable, uuid, varchar, date, timestamp } from 'drizzle-orm/pg-core';

export const ballots = pgTable('ballots', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Malgré son nom, identifiant source toutes assemblées confondues, préfixé
  // par origine : `scrutin-{uid}` (AN), `senat-scrutin-{session}-{numéro}`,
  // `europarl-vote-{id}`. Clé d'upsert.
  anId: varchar('an_id', { length: 50 }).unique(),
  title: varchar('title', { length: 1024 }).notNull(),
  date: date('date').notNull(),
  // Libellé source du type de vote (AN : « ordinaire », « solennel »... ;
  // Sénat : 'ordinaire' ; PE : 'europarl').
  type: varchar('type', { length: 100 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
