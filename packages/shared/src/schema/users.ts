/**
 * Tables d'authentification de l'interface d'administration
 * (`packages/admin`, Next.js + Auth.js) : `users`, `accounts`,
 * `verification_tokens`. Aucun lien avec les élus : ce sont les comptes
 * des modérateurs.
 *
 * `accounts` et `verification_tokens` suivent le schéma imposé par
 * `@auth/drizzle-adapter` (d'où les colonnes en snake_case côté TypeScript
 * comme `refresh_token` : l'adaptateur attend ces noms de propriétés
 * exacts). En pratique seul le provider Credentials (email + mot de passe
 * bcrypt dans `users.password_hash`) est configuré ; `accounts` et
 * `verification_tokens` restent vides mais sont requis par l'adaptateur.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  primaryKey,
  integer,
} from 'drizzle-orm/pg-core';

/**
 * Rôles de l'admin : `moderator` accède à la modération des liens,
 * `admin` en plus à la gestion des comptes et des doublons d'élus.
 */
export const userRoleEnum = ['admin', 'moderator'] as const;

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: varchar('image', { length: 1024 }),
  passwordHash: varchar('password_hash', { length: 255 }),
  role: varchar('role', { length: 20 }).notNull(),
  // Seul timestamp du schéma sans fuseau (héritage de la migration
  // initiale, conservé tel quel).
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 255 }).notNull(),
    provider: varchar('provider', { length: 255 }).notNull(),
    providerAccountId: varchar('provider_account_id', {
      length: 255,
    }).notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: varchar('token_type', { length: 255 }),
    scope: varchar('scope', { length: 255 }),
    id_token: text('id_token'),
    session_state: varchar('session_state', { length: 255 }),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ],
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: varchar('identifier', { length: 255 }).notNull(),
    token: varchar('token', { length: 255 }).notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);
