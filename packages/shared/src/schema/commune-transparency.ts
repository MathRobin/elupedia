import {
  pgTable,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const communeTransparency = pgTable(
  'commune_transparency',
  {
    communeCode: varchar('commune_code', { length: 10 }).primaryKey(),
    madadaUrlName: varchar('madada_url_name', { length: 255 }).notNull(),
    requestsCount: integer('requests_count').default(0).notNull(),
    requestsSuccessful: integer('requests_successful').default(0).notNull(),
    requestsOverdue: integer('requests_overdue').default(0).notNull(),
    requestsNotHeld: integer('requests_not_held').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex('commune_transparency_madada_idx').on(t.madadaUrlName)],
);
