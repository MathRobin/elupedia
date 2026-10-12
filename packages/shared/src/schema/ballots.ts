import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Résultat officiel du scrutin tel que publié par l'assemblée (AN : `sort.code`,
 * Sénat : suffixe « Adoption »/« Rejet » de l'index), normalisé en anglais.
 * `null` quand la source ne le publie pas (ex. scrutins europarl, limités à la
 * délégation française).
 */
export const ballotResultEnum = ['adopted', 'rejected'] as const;
export type BallotResult = (typeof ballotResultEnum)[number];

export const ballots = pgTable('ballots', {
  id: uuid('id').defaultRandom().primaryKey(),
  anId: varchar('an_id', { length: 50 }).unique(),
  // Certains intitulés du Sénat dépassent 1 000 caractères (motions longues).
  title: text('title').notNull(),
  date: date('date').notNull(),
  type: varchar('type', { length: 100 }).notNull(),
  result: varchar('result', { length: 20 }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
