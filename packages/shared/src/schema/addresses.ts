/**
 * Table `addresses` : adresses et coordonnées de contact d'un élu
 * (permanence en circonscription, bureau à l'assemblée, mairie).
 *
 * Alimentée par `an-adresses.ts` (ZIP AMO10 de l'AN), `senat-adresses.ts`
 * (API JSON Sénat) et `dila-mairies.ts` (Annuaire de l'administration, pour
 * les maires). Les coordonnées GPS viennent de la source quand elle les
 * fournit (DILA) ou d'un géocodage a posteriori (`geocode-addresses.ts`).
 */
import {
  pgTable,
  uuid,
  varchar,
  doublePrecision,
  timestamp,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

/** Valeurs attendues de `addresses.type` (varchar libre, pas d'enum SQL). */
export const addressTypeEnum = [
  'constituency_office',
  'assembly_office',
] as const;

export const addresses = pgTable('addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  type: varchar('type', { length: 50 }).notNull(),
  street: varchar('street', { length: 500 }),
  postalCode: varchar('postal_code', { length: 20 }),
  city: varchar('city', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
