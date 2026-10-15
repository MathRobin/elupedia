/**
 * Table `committees` : appartenance d'un élu à une commission, délégation,
 * groupe d'études ou groupe d'amitié. Une ligne par (élu, organe, période),
 * pas de table d'organes séparée : le nom est dupliqué sur chaque membre.
 *
 * Alimentée par `an-commissions.ts` (open data AN) et
 * `senat-commissions.ts` (ODSEN_COMS / ODSEN_OFFDEL). Le site regroupe par
 * `slugifyText(name)` pour les pages `/commissions/{slug}` ; un même organe
 * nommé différemment selon la source apparaît donc comme deux commissions
 * (voir `dedupe:committees`).
 */
import { pgTable, uuid, varchar, date, timestamp } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

/** Valeurs attendues de `committees.type` (varchar libre, pas d'enum SQL). */
export const committeeTypeEnum = [
  'standing_committee',
  'special_committee',
  'delegation',
  'study_group',
  'friendship_group',
] as const;

export const committees = pgTable('committees', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  name: varchar('name', { length: 500 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  // Identifiant de l'organe dans l'open data de l'Assemblée nationale (ex. PO854288),
  // qui permet de reconstruire l'URL de la fiche d'instance. Null pour le Sénat.
  anUid: varchar('an_uid', { length: 20 }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
