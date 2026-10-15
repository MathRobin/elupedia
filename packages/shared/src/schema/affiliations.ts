/**
 * Table `affiliations` : historique des appartenances politiques d'un élu
 * (groupe parlementaire, parti national, groupe européen).
 *
 * Alimentée par diff : AN via `affiliations-diff.ts` (à partir de
 * `mandates.political_group`), Sénat via `senat-affiliations.ts`, Parlement
 * européen via `meps.ts`. Un changement de groupe clôture la ligne
 * précédente (`end_date`) et en ouvre une nouvelle.
 *
 * Piège : les libellés diffèrent de ceux de `mandates.political_group`
 * (ex. « Groupe Union Centriste » ici, « Union Centriste (UC) » là) ; voir
 * la troisième section de `POLITICAL_GROUP_URLS`.
 */
import { pgTable, uuid, varchar, date, timestamp } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const affiliations = pgTable('affiliations', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  partyOrGroup: varchar('party_or_group', { length: 255 }).notNull(),
  // Nature de l'appartenance : 'group' (défaut, groupe parlementaire AN/Sénat,
  // comportement historique), 'national_party' ou 'european_group' (eurodéputés :
  // les deux coexistent, contrairement à AN/Sénat où group == party_or_group).
  // Les diffs AN ne touchent que kind = 'group'.
  kind: varchar('kind', { length: 50 }).notNull().default('group'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
