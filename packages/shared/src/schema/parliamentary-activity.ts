/**
 * Table `parliamentary_activity` : questions écrites, questions orales et
 * interpellations déposées par un élu, toutes assemblées confondues.
 *
 * Alimentée par `an-activite.ts` (JSON open data AN), `senat-activite.ts`
 * (dump SQL questions.zip de data.senat.fr) et
 * `parlement-europeen-questions.ts` (API Open Data du PE). Amendements et
 * rapports (`activityTypeEnum`, `amendmentStatusEnum`) sont prévus mais
 * pas encore ingérés.
 *
 * Pièges : pour le Parlement européen, `question_text`/`response_text`
 * restent null (texte uniquement en PDF/DOCX côté source) et
 * `government_comments` porte le destinataire (Conseil/Commission) faute
 * de colonne dédiée.
 */
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
// lignes mélangées sans façon de les distinguer (M24T5).
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
  // Statut source brut (ex. « Répondue », « Retirée ») ; null si absent.
  status: varchar('status', { length: 20 }),
  questionText: text('question_text'),
  responseText: text('response_text'),
  responseDate: date('response_date'),
  // Ministère attributaire (AN/Sénat) ou destinataire Conseil/Commission (PE).
  governmentComments: text('government_comments'),
  sourceUrl: text('source_url'),
  // Indexation thématique AN (`indexationAN.rubrique` / `teteAnalyse`),
  // null pour les autres sources.
  rubrique: varchar('rubrique', { length: 255 }),
  teteAnalyse: varchar('tete_analyse', { length: 512 }),
  questionNumber: integer('question_number'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
