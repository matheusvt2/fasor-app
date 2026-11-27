import type { EntityRow } from '@app/domain';
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
    // A-3 (review 2026-09-30): the company pull's per-relatório totals of live blocks and
    // photos (`relatorioTotals`) read only live rows, grouped by relatório and entity.
    index('entities_company_relatorio_entity_live_idx').on(t.company_id, t.relatorio_id, t.entity).where(sql`${t.removed_at} is null`),
  ],
);

/*
 * Story 8.4: one row per attempt of a reading job, successful or failed, so the token ids a
 * suggestion cites resolve later (`ocr_result` keeps the tokens with their boxes normalized
 * over the image sent) and every model call is accounted for (`model`, `prompt_version`,
 * `llm_usage`). A suggestion's `source.reading_run_id` names the row of its run. Written
 * only by the reading job; never synced to a device.
 */
export const readingRuns = pgTable(
  'reading_runs',
  {
    id: uuid('id').primaryKey(),
    company_id: uuid('company_id').notNull(),
    photo_id: uuid('photo_id').notNull(),
    relatorio_id: uuid('relatorio_id'),
    reading_kind: text('reading_kind').notNull(),
    /** The pg-boss job id. */
    job_id: text('job_id'),
    /** 1 for the first attempt of a job, `retryCount + 1` after. */
    attempt: integer('attempt').notNull(),
    outcome: text('outcome').notNull(),
    error: text('error'),
    ocr_provider: text('ocr_provider').notNull(),
    ocr_result: json('ocr_result'),
    model: text('model'),
    prompt_version: text('prompt_version'),
    llm_usage: json('llm_usage'),
    duration_ms: integer('duration_ms').notNull(),
    created_at: timestamptz('created_at').notNull(),
  },
  (t) => [
    index('reading_runs_company_photo_idx').on(t.company_id, t.photo_id),
    check('reading_runs_outcome_check', sql`${t.outcome} in ('ok', 'error')`),
  ],
);

/*
 * Story 31.2 (AD-30): one row per attempt of a transcription job, successful or failed, so every
 * speech and writing call is accounted for: the providers and the writing model, the prompt
 * version, the audio seconds, the tokens and the USD, how long it took, whether the written text
 * passed the guard (`guard_outcome`) and, when the field received the text as heard instead, why
 * (`fallback_reason`), and whether a table's speech was no reading (`not_a_reading`). An audio's
 * `transcription_run_id` names the row of the run that wrote it. Written only by the job; never
 * synced to a device. Story 31.9: a tap on the AI control (`POST /api/relatorios/{id}/write`) stores
 * one row too, `kind = 'ai_write'`, with no audio and no speech step, the user who tapped it and the
 * field's target; its `guard_outcome` says whether the answer reached the device.
 */
export const transcriptionRuns = pgTable(
  'transcription_runs',
  {
    id: uuid('id').primaryKey(),
    company_id: uuid('company_id').notNull(),
    /** Story 31.9: `transcription` (a job's attempt) or `ai_write` (a tap on the AI control). */
    kind: text('kind').notNull().default('transcription'),
    /** The audio a transcription run heard; null on an `ai_write` row. */
    audio_id: uuid('audio_id'),
    /** Story 31.9: the user who tapped the AI control; null on a transcription row. */
    user_id: text('user_id'),
    /** Story 31.9: the field an `ai_write` row rewrote (its `audio_target`); null on a transcription row. */
    target: json('target'),
    relatorio_id: uuid('relatorio_id'),
    /** The pg-boss job id. */
    job_id: text('job_id'),
    attempt: integer('attempt').notNull(),
    outcome: text('outcome').notNull(),
    error: text('error'),
    /** The writing level of the target (`polish`, `report`, `reading`), once the target was read. */
    level: text('level'),
    /** Null on an `ai_write` row (no speech step). */
    speech_provider: text('speech_provider'),
    speech_model: text('speech_model'),
    writing_provider: text('writing_provider'),
    model: text('model'),
    prompt_version: text('prompt_version'),
    audio_seconds: doublePrecision('audio_seconds'),
    input_tokens: integer('input_tokens'),
    output_tokens: integer('output_tokens'),
    /** The speech and the writing calls together, at list price. */
    usd: doublePrecision('usd'),
    duration_ms: integer('duration_ms').notNull(),
    guard_outcome: text('guard_outcome'),
    fallback_reason: text('fallback_reason'),
    not_a_reading: boolean('not_a_reading').notNull().default(false),
    created_at: timestamptz('created_at').notNull(),
  },
  (t) => [
    index('transcription_runs_company_audio_idx').on(t.company_id, t.audio_id),
    check('transcription_runs_outcome_check', sql`${t.outcome} in ('ok', 'error')`),
    check('transcription_runs_kind_check', sql`${t.kind} in ('transcription', 'ai_write')`),
  ],
);

/*
 * Story 20.12 (security pass S6): the per-company daily counters of paid AI work, one row per
 * company, `America/Sao_Paulo` calendar day and kind (`reading`: every reading started, rereads
 * included; `audit`: every emission audit run created; since the 2026-11-26 security pass also
 * `transcription`: every transcription started, and `ai_write`: every AI control tap that reaches
 * the writing provider). `consumeDailyQuota`
 * (`db/repositories/ai-usage.ts`) is the only writer; never synced to a device.
 */
export const aiUsageDaily = pgTable(
  'ai_usage_daily',
  {
    company_id: uuid('company_id').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    kind: text('kind').notNull(),
    count: integer('count').notNull(),
  },
  (t) => [primaryKey({ columns: [t.company_id, t.day, t.kind] }), check('ai_usage_daily_kind_check', sql`${t.kind} in ('reading', 'audit', 'transcription', 'ai_write')`)],
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
 * tenant at row creation. *(2026-11-21, Story 26.6: `verification` now holds the password links,
 * `reset-password:<token>` with the user's id as value; the Admin's routes fill `company_id`, and
 * the forgot-password hook stamps it on the row better-auth inserted.)*
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

/*
 * Story 26.6 (AD-9): what the `fake` e-mail provider "sent", one row per message, read by the api
 * tests and the e2e helpers (`email/fake-store.ts`). Never written by the `ses` provider, never
 * synced; it holds addresses, so it stays out of every log and every pull. No `company_id`: a
 * message belongs to an address, and the forgot-password path has no company until the address
 * resolves to a user.
 */
export const fakeEmail = pgTable(
  'fake_email',
  {
    id: uuid('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    to_email: text('to_email').notNull(),
    purpose: text('purpose').notNull(),
    subject: text('subject').notNull(),
    text_body: text('text_body').notNull(),
    html_body: text('html_body').notNull(),
  },
  (t) => [index('fake_email_to_created_idx').on(t.to_email, t.created_at), check('fake_email_purpose_check', sql`${t.purpose} in ('invitation', 'reset')`)],
);

// `fakeEmail` stays out: better-auth's adapter reads only its own four models from here.
export const schema = { ops, entities, syncDevicePush, readingRuns, transcriptionRuns, aiUsageDaily, company, user, session, account, verification };
