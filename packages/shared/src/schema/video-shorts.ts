import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { ballots } from './ballots.js';

/**
 * Cycle de vie d'un short vidéo :
 * - candidate : sélectionné automatiquement, en attente de relecture
 * - draft     : script et/ou rendu générés, à vérifier
 * - approved  : validé par un humain, prêt à publier
 * - published : mis en ligne
 * - rejected  : écarté lors de la relecture
 */
export const videoShortStatusEnum = [
  'candidate',
  'draft',
  'approved',
  'published',
  'rejected',
] as const;
export type VideoShortStatus = (typeof videoShortStatusEnum)[number];

export const videoShorts = pgTable('video_shorts', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: varchar('status', { length: 20 }).notNull().default('candidate'),
  /** Score de sélection (voir packages/shorts/src/select-candidates.ts). */
  score: integer('score').notNull(),
  /** Détail des critères ayant produit le score, pour traçabilité. */
  scoreDetails: jsonb('score_details'),
  /** Script structuré (scènes, voix off, textes à l'écran), rempli plus tard. */
  script: jsonb('script'),
  videoKey: varchar('video_key', { length: 512 }),
  thumbnailKey: varchar('thumbnail_key', { length: 512 }),
  youtubeVideoId: varchar('youtube_video_id', { length: 32 }),
  notes: text('notes'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Un short peut couvrir plusieurs scrutins (ex. deux votes mineurs la même semaine). */
export const videoShortBallots = pgTable(
  'video_short_ballots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    videoShortId: uuid('video_short_id')
      .notNull()
      .references(() => videoShorts.id, { onDelete: 'cascade' }),
    ballotId: uuid('ballot_id')
      .notNull()
      .references(() => ballots.id),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    uniqueIndex('video_short_ballots_short_ballot_idx').on(
      t.videoShortId,
      t.ballotId,
    ),
  ],
);
