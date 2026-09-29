import {
  pgTable,
  uuid,
  varchar,
  date,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { officials } from './officials.js';

export const activityTypeEnum = [
  'written_question',
  'oral_question',
  'interpellation',
  'amendment',
  'report',
] as const;

export const amendmentStatusEnum = [
  'adopted',
  'rejected',
  'withdrawn',
] as const;

// Distingue l'origine d'une activité : AN/Sénat/PE ont chacun leurs propres
// questions écrites/orales dans la même table, et un élu cumulant un mandat
// national et un mandat européen (successif ou simultané) aurait sinon des
// lignes mélangées sans façon de les distinguer (M24T5/M24T7).
export const parliamentaryActivitySourceEnum = [
  'assemblee_nationale',
  'senat',
  'europarl',
] as const;

export const parliamentaryActivity = pgTable('parliamentary_activity', {
  id: uuid('id').defaultRandom().primaryKey(),
  officialId: uuid('official_id')
    .notNull()
    .references(() => officials.id),
  type: varchar('type', { length: 50 }).notNull(),
  source: varchar('source', { length: 30 }).notNull(),
  title: varchar('title', { length: 1024 }).notNull(),
  date: date('date').notNull(),
  status: varchar('status', { length: 20 }),
  questionText: text('question_text'),
  responseText: text('response_text'),
  responseDate: date('response_date'),
  governmentComments: text('government_comments'),
  sourceUrl: text('source_url'),
  rubrique: varchar('rubrique', { length: 255 }),
  teteAnalyse: varchar('tete_analyse', { length: 512 }),
  questionNumber: integer('question_number'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
