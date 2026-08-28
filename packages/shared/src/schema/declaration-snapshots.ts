import { pgTable, uuid, varchar, date, text } from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const declarationTypeEnum = ['initial', 'modification'] as const;

export type DeclarationType = (typeof declarationTypeEnum)[number];

export const declarationSnapshots = pgTable('declaration_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  declarationDate: date('declaration_date').notNull(),
  declarationType: varchar('declaration_type', { length: 20 }).notNull(),
  sourceDocumentUrl: text('source_document_url'),
});
