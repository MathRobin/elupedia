/**
 * Table `interests` : lignes des déclarations d'intérêts et d'activités
 * HATVP d'un élu (une ligne par activité, mandat annexe ou participation
 * déclarée). L'historique des dépôts est dans `declaration_snapshots`.
 *
 * Alimentée par `hatvp.ts` (XML public `declarations.xml`) →
 * `upsert/interests.ts`, pour les mandats éligibles à la HATVP (députés,
 * sénateurs...). Les eurodéputés relèvent d'un autre régime (déclaration au
 * Parlement européen) et n'ont pas de lignes ici.
 *
 * Piège : `category` suit `interestCategoryEnum` (vocabulaire Elupedia),
 * mais `type` reprend le nom de la rubrique source (ex. 'company_share',
 * 'nonprofit_role'), qui ne coïncide pas toujours avec la catégorie.
 */
import {
  pgTable,
  uuid,
  varchar,
  date,
  text,
  jsonb,
  numeric,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const interestCategoryEnum = [
  'professional_activity',
  'consulting_activity',
  'governing_body_membership',
  'voluntary_activity',
  'elected_function',
  'financial_participation',
] as const;

export type InterestCategory = (typeof interestCategoryEnum)[number];

export const interests = pgTable('interests', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  category: varchar('category', { length: 50 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  entityName: varchar('entity_name', { length: 500 }).notNull(),
  roleDescription: text('role_description'),
  // Date de la déclaration dont la ligne est issue (distincte des dates de
  // l'activité elle-même).
  declaredDate: date('declared_date').notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  // Rubrique XML source brute, pour les champs non modélisés.
  full: jsonb('full'),
  // Enrichissements (M12T5), tous nullables : commentaire libre du
  // déclarant, PDF source, détail de participation (% capital), montant
  // annuel en euros avec son année et sa nature (net ou brut).
  declarantComment: text('declarant_comment'),
  sourceDocumentUrl: text('source_document_url'),
  ownershipDetail: text('ownership_detail'),
  annualAmount: numeric('annual_amount'),
  amountYear: integer('amount_year'),
  amountIsNet: boolean('amount_is_net'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
