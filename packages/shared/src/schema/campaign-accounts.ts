/**
 * Table `campaign_accounts` : comptes de campagne publiés par la CNCCFP
 * (Commission nationale des comptes de campagne), un par candidat et par
 * élection.
 *
 * Alimentée par `cnccfp.ts` (CSV data.gouv.fr, un fichier par élection :
 * législatives 2022/2024, sénatoriales 2023). Le rattachement à `officials`
 * se fait par nom + département + nuance, d'où `official_id` nullable : les
 * candidats non élus sont conservés sans fiche.
 *
 * Tous les montants sont en euros entiers. Chaque poste existe en version
 * « déclarée » (par le candidat) et « retenue » (après contrôle CNCCFP).
 */
import {
  pgTable,
  uuid,
  varchar,
  integer,
  date,
  timestamp,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const campaignAccounts = pgTable('campaign_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id').references(() => officials.id),
  // Identifiant du candidat dans le fichier CNCCFP (colonne `candidat`).
  cnccfpId: varchar('cnccfp_id', { length: 20 }).notNull().unique(),
  candidateName: varchar('candidate_name', { length: 500 }).notNull(),
  // Identifiant d'élection maison, ex. 'legislatives_2024' (voir
  // CNCCFP_ELECTIONS dans l'ingest), pas le type seul.
  electionType: varchar('election_type', { length: 50 }).notNull(),
  electionDate: date('election_date').notNull(),
  constituency: varchar('constituency', { length: 500 }),
  department: varchar('department', { length: 255 }),
  departmentCode: varchar('department_code', { length: 10 }),
  politicalLabel: varchar('political_label', { length: 255 }),
  expensesDeclared: integer('expenses_declared'),
  expensesRetained: integer('expenses_retained'),
  revenueDeclared: integer('revenue_declared'),
  revenueRetained: integer('revenue_retained'),
  donationsDeclared: integer('donations_declared'),
  donationsRetained: integer('donations_retained'),
  personalContributionDeclared: integer('personal_contribution_declared'),
  personalContributionRetained: integer('personal_contribution_retained'),
  partyContributionsDeclared: integer('party_contributions_declared'),
  partyContributionsRetained: integer('party_contributions_retained'),
  reimbursement: integer('reimbursement'),
  // Code de décision CNCCFP : A (approuvé), AR (approuvé après
  // réformation), R (rejeté), DD (non déposé). Libellés côté site.
  decision: varchar('decision', { length: 10 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
