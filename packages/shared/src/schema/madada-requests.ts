import {
  pgTable,
  varchar,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const madadaRequests = pgTable(
  'madada_requests',
  {
    madadaId: integer('madada_id').primaryKey(),
    communeCode: varchar('commune_code', { length: 10 }).notNull(),
    urlTitle: varchar('url_title', { length: 512 }).notNull(),
    title: varchar('title', { length: 1024 }).notNull(),
    status: varchar('status', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('madada_requests_commune_created_idx').on(t.communeCode, t.createdAt),
  ],
);
