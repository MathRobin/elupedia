import { pgTable, uuid, varchar, integer, date } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const campaignAccounts = pgTable('campaign_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id').references(() => officials.id),
  cnccfpId: varchar('cnccfp_id', { length: 20 }).notNull().unique(),
  candidateName: varchar('candidate_name', { length: 500 }).notNull(),
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
  decision: varchar('decision', { length: 10 }).notNull(),
});
