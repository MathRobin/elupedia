/**
 * Table `mandates` : historique des mandats d'un élu, une ligne par
 * (élu, type de mandat, date de début).
 *
 * Alimentée par les ingestions AN, Sénat, Parlement européen et les
 * fichiers RNE (maires, conseillers départementaux/régionaux/
 * d'arrondissement, assemblées à statut particulier, Français de
 * l'étranger). Un mandat en cours a `end_date` null ; les upserts
 * « ferment » l'ancien mandat (end_date) et en ouvrent un nouveau quand la
 * source change de ligne pour la même personne.
 *
 * `type` est un varchar libre (valeurs dans `MANDATE_TYPE_LABELS`), pas un
 * enum Postgres. `department` porte toujours un libellé de
 * `DEPARTMENT_CODES` (clé du filtre « Département » du site), y compris
 * la constante « Français établis hors de France ».
 */
import {
  pgTable,
  uuid,
  varchar,
  date,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const mandates = pgTable(
  'mandates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    officialId: uuid('official_id')
      .notNull()
      .references(() => officials.id),
    type: varchar('type', { length: 100 }).notNull(),
    // Circonscription au sens large selon le type : « 3e circonscription »
    // (député), canton, section départementale, secteur d'arrondissement,
    // circonscription AFE...
    district: varchar('district', { length: 255 }),
    department: varchar('department', { length: 255 }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    // Groupe parlementaire courant, libellé « Nom complet (SIGLE) » (clé de
    // POLITICAL_GROUP_COLORS / POLITICAL_GROUP_URLS). L'historique des
    // changements est dans `affiliations`.
    politicalGroup: varchar('political_group', { length: 255 }),
    // Numéro de législature (ex. 10 pour le Parlement européen 2024-2029). Non renseigné pour AN/Sénat, où les dates suffisent.
    legislature: integer('legislature'),
    // Renseigné pour type = 'maire' (code INSEE de la commune),
    // 'conseiller_arrondissement' (code de la ville entière, pas d'arrondissement
    // dédié dans le RNE) et 'conseiller_communautaire' (commune de rattachement ;
    // le libellé de l'EPCI est dans `district`). Pour 'conseiller_departemental'/'conseiller_regional',
    // la circonscription électorale (canton/section) est stockée dans `district`.
    communeCode: varchar('commune_code', { length: 10 }),
    // Code INSEE de la ville de rattachement d'un arrondissement PLM ;
    // prévu mais jamais renseigné par l'ingestion actuelle (seule l'API
    // /api/commune/[code] le lit).
    parentCommuneCode: varchar('parent_commune_code', { length: 10 }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Clé naturelle d'upsert : un élu ne peut pas commencer deux mandats
    // du même type le même jour.
    uniqueIndex('mandates_official_type_start_idx').on(
      table.officialId,
      table.type,
      table.startDate,
    ),
  ],
);
