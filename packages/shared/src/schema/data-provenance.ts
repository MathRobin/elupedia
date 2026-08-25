import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const dataProvenance = pgTable('data_provenance', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceTable: text('source_table').notNull(),
  sourceRecordId: text('source_record_id').notNull(),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  legalBasis: text('legal_basis').notNull(),
  rawData: jsonb('raw_data'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
});
