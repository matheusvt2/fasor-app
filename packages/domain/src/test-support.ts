import { toIso } from './clock.ts';
import type { NewId } from './ids.ts';
import { opSchema, type Op, type OpInput } from './ops/op.ts';

/*
 * Deterministic helpers for kernel tests: fixed ids and timestamps, no clock
 * and no randomness (TC-1, TC-2). Not part of the public kernel surface.
 */

/** A NewId that yields `019966b0-0002-7000-8000-0000000000NN` in sequence. */
export function idSequence(prefix = '019966b0-0002-7000-8000-'): NewId {
  let n = 0;
  return () => `${prefix}${(++n).toString(16).padStart(12, '0')}`;
}

export const T0 = new Date('2026-09-21T12:00:00.000Z');
export const T1 = new Date('2026-09-27T12:00:00.000Z');

export function atMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

export const TEST_COMPANY = '019966b0-0003-7000-8000-000000000001';
export const TEST_USER = '019966b0-0003-7000-8000-000000000002';
export const TEST_RELATORIO = '019966b0-0003-7000-8000-000000000003';
export const TEST_PROJECT = '019966b0-0003-7000-8000-000000000004';
export const TEST_DEVICE = 'tablet-test';

export interface OpFactory {
  /** Builds an op with the next id and timestamp; `scope` defaults to relatorio. */
  op(input: Partial<OpInput> & { path: string; value: unknown }): Op;
  newId: NewId;
}

/** An op factory over one fixed id sequence and a clock advancing one minute per op. */
export function opFactory(base: Date = T0, newId: NewId = idSequence()): OpFactory {
  let minute = 0;
  return {
    newId,
    op(input) {
      const scope = input.scope ?? 'relatorio';
      return opSchema.parse({
        kind: input.kind ?? 'put',
        scope,
        company_id: input.company_id ?? TEST_COMPANY,
        project_id: input.project_id ?? (scope === 'project' ? TEST_PROJECT : null),
        relatorio_id: input.relatorio_id ?? (scope === 'relatorio' ? TEST_RELATORIO : null),
        prev_op_id: input.prev_op_id ?? null,
        batch_id: input.batch_id ?? null,
        meta: input.meta ?? null,
        actor_id: input.actor_id ?? TEST_USER,
        device_id: input.device_id ?? TEST_DEVICE,
        path: input.path,
        value: input.value,
        op_id: newId(),
        client_ts: toIso(atMinutes(base, minute++)),
      });
    },
  };
}
