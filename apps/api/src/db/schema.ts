import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Drizzle schema. TS identifiers are camelCase, columns are snake_case (Consistency
 * Conventions). Every table but `company` carries `company_id` (AD-10). Route handlers
 * read these tables only through the repository layer in `./repositories`, which always
 * takes the company id as a required typed argument; the auth session hook in
 * `../auth/auth.ts` and the provisioning seed in `./seed.ts` are the two places that
 * touch better-auth's own tables directly, because they run outside a request.
 *
 * `session`, `account` and `verification` are better-auth's own models. better-auth
 * inserts their rows itself, so their `company_id` is nullable: `session.company_id` is
 * filled by the `databaseHooks.session.create.before` hook in `../auth/auth.ts`, and
 * `verification` is never written in the MVP (no e-mail verification, no password reset
 * by e-mail) so it has no tenant at row creation.
 */

export const company = pgTable('company', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id')
      .notNull()
      .references(() => company.id),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    council: text('council'),
    registrationNumber: text('registration_number'),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_email_unique').on(table.email),
    index('user_company_id_idx').on(table.companyId),
  ],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id').references(() => company.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('session_token_unique').on(table.token),
    index('session_user_id_idx').on(table.userId),
  ],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id').references(() => company.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    uniqueIndex('account_provider_account_unique').on(table.providerId, table.accountId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id').references(() => company.id),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const schema = { company, user, session, account, verification };
