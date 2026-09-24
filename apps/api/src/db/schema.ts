import type { EntityRow } from '@app/domain';
import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/*
 * AD-3, AD-10: the op log and the materialized rows. Every table carries
 * `company_id` and every query takes it as an argument. `seq` is a global
 * bigserial; it is monotonic per company because `applyOps` serializes
 * applies per company with a transaction-level advisory lock.
 */

/** AD-17: timestamps cross the driver as canonical UTC ISO strings (`YYYY-MM-DDTHH:mm:ss.sssZ`). */
const timestamptz = customType<{ data: string; driverData: string }>({
  dataType: () => 'timestamp with time zone',
  toDriver: (value) => value,
  fromDriver: (value) => new Date(value).toISOString(),
});

/**
 * `jsonb` without a second parse. postgres.js already decodes `json`/`jsonb` (oids 114
 * and 3802) with `JSON.parse`, while drizzle's own `jsonb()` column runs `JSON.parse`
 * again over any string it receives, so a stored JSON string that is itself JSON text
 * (`"4"`, an `order_key`; `"2026"`, `"true"`, `"null"` typed into a setup field) came back
 * type-changed (a number, a boolean, null) and a device's `applyOp` refused the page. The
 * invariant is "what was written comes back identical": `toDriver` serializes, `fromDriver`
 * returns the driver's decoded value as is. A raw string can only reach `fromDriver` when
 * the stored value is that string, because the driver's parser decodes every jsonb column.
 */
const json = customType<{ data: unknown; driverData: unknown }>({
  dataType: () => 'jsonb',
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => value,
});

export const ops = pgTable(
  'ops',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    op_id: uuid('op_id').notNull().unique(),
    company_id: uuid('company_id').notNull(),
    scope: text('scope').notNull(),
    project_id: uuid('project_id'),
    relatorio_id: uuid('relatorio_id'),
    kind: text('kind').notNull(),
    path: text('path').notNull(),
    value: json('value'),
    prev_op_id: uuid('prev_op_id'),
    batch_id: uuid('batch_id'),
    meta: json('meta'),
    actor_id: text('actor_id').notNull(),
    device_id: text('device_id').notNull(),
    client_ts: timestamptz('client_ts').notNull(),
    received_at: timestamptz('received_at').notNull(),
  },
  (t) => [
    index('ops_company_seq_idx').on(t.company_id, t.seq),
    index('ops_company_relatorio_seq_idx').on(t.company_id, t.relatorio_id, t.seq),
    index('ops_company_project_seq_idx').on(t.company_id, t.project_id, t.seq),
    // AD-24 `superseded`: the latest op on a path, read inside the per-company transaction.
    index('ops_company_path_seq_idx').on(t.company_id, t.path, t.seq),
  ],
);

/** AD-24: `last_push_at` per `(user_id, device_id)`, returned in the company pull summary. */
export const syncDevicePush = pgTable(
  'sync_device_push',
  {
    company_id: uuid('company_id').notNull(),
    user_id: text('user_id').notNull(),
    device_id: text('device_id').notNull(),
    last_push_at: timestamptz('last_push_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.company_id, t.user_id, t.device_id] })],
);

export const entities = pgTable(
  'entities',
  {
    company_id: uuid('company_id').notNull(),
    entity: text('entity').notNull(),
    id: uuid('id').notNull(),
    relatorio_id: uuid('relatorio_id'),
    project_id: uuid('project_id'),
    row: json('row').$type<EntityRow>().notNull(),
    removed_at: timestamptz('removed_at'),
    updated_seq: bigint('updated_seq', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.company_id, t.entity, t.id] }),
    index('entities_company_relatorio_idx').on(t.company_id, t.relatorio_id),
    index('entities_company_project_idx').on(t.company_id, t.project_id),
  ],
);

/*
 * Identity (Story 1.3). `company.id` is a uuid so it joins `ops.company_id` and
 * `entities.company_id` without a cast. Route handlers read these tables only
 * through `./repositories`, whose every function takes the company id as a
 * required typed argument (AD-10); the better-auth session hook in
 * `../auth/auth.ts` and the provisioning seed in `./seed.ts` touch them directly
 * because they run outside a request.
 *
 * `session`, `account` and `verification` are better-auth's own models. better-auth
 * inserts their rows itself, so their `company_id` is nullable: `session.company_id` is
 * filled by the `databaseHooks.session.create.before` hook, and `verification` is never
 * written in the MVP (no e-mail verification, no password reset by e-mail) so it has no
 * tenant at row creation.
 */

export const company = pgTable('company', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => company.id),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    // The CAP-6 registration (council, number, printed title) is not here: it lives on the
    // kernel `user` entity, written by `user/{id}/{field}` ops (retro A2).
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
    companyId: uuid('company_id').references(() => company.id),
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
    companyId: uuid('company_id').references(() => company.id),
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
    companyId: uuid('company_id').references(() => company.id),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const schema = { ops, entities, syncDevicePush, company, user, session, account, verification };
