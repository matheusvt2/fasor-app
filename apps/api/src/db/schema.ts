import type { EntityRow } from '@app/domain';
import { bigint, bigserial, customType, index, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

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
    value: jsonb('value'),
    prev_op_id: uuid('prev_op_id'),
    batch_id: uuid('batch_id'),
    meta: jsonb('meta'),
    actor_id: text('actor_id').notNull(),
    device_id: text('device_id').notNull(),
    client_ts: timestamptz('client_ts').notNull(),
    received_at: timestamptz('received_at').notNull(),
  },
  (t) => [
    index('ops_company_seq_idx').on(t.company_id, t.seq),
    index('ops_company_relatorio_seq_idx').on(t.company_id, t.relatorio_id, t.seq),
    index('ops_company_project_seq_idx').on(t.company_id, t.project_id, t.seq),
  ],
);

export const entities = pgTable(
  'entities',
  {
    company_id: uuid('company_id').notNull(),
    entity: text('entity').notNull(),
    id: uuid('id').notNull(),
    relatorio_id: uuid('relatorio_id'),
    project_id: uuid('project_id'),
    row: jsonb('row').$type<EntityRow>().notNull(),
    removed_at: timestamptz('removed_at'),
    updated_seq: bigint('updated_seq', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.company_id, t.entity, t.id] }),
    index('entities_company_relatorio_idx').on(t.company_id, t.relatorio_id),
    index('entities_company_project_idx').on(t.company_id, t.project_id),
  ],
);

export const schema = { ops, entities };
