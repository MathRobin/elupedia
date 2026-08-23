import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const userRoleEnum = ['admin', 'moderator'] as const;

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  role: varchar('role', { length: 20 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
