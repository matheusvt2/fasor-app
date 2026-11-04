import { describe, expect, it } from 'vitest';
import type { Op } from '../ops/op.ts';
import { resendRestampOrder } from './resend.ts';

/*
 * E20-A1 (R-2), review loop 1: which dead rows "Reenviar" stamps again, and in what order. A row
 * refused op_target_missing is stamped again only when it depends on a create stamped again in
 * the same run, through its target or a row its value names, transitively.
 */

const COMPANY = '019966c1-0000-7000-8000-00000000000c';
const RELATORIO = '019966c1-0000-7000-8000-0000000000a1';
const LOCAL = '019966c1-0000-7000-8000-0000000000c1';
const CHILD = '019966c1-0000-7000-8000-0000000000c2';
const POINT = '019966c1-0000-7000-8000-0000000000e1';
const OTHER_POINT = '019966c1-0000-7000-8000-0000000000e2';

/** An op with the given commit position (`op_id` order) and stamp. */
function op(position: number, input: Pick<Op, 'kind' | 'path'> & Partial<Op>, clientTs = '2026-11-04T12:00:00.000Z'): Op {
  return {
    op_id: `019966c1-0000-7000-8000-${String(position).padStart(12, '0')}`,
    scope: 'relatorio',
    company_id: COMPANY,
    project_id: null,
    relatorio_id: RELATORIO,
    value: null,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: '019966c1-0000-7000-8000-0000000000e9',
    device_id: 'tablet-1',
    client_ts: clientTs,
    ...input,
  } as Op;
}

const location = (id: string, parentId: string | null) => ({ id, relatorio_id: RELATORIO, kind: 'cabine', name: 'Cabine', parent_id: parentId, order_key: 'a0', removed_at: null });

describe('resendRestampOrder', () => {
  it('a put whose value names a create stamped again is stamped again with it; a target-missing row that names none is not', () => {
    const create = op(1, { kind: 'create', path: `location/${LOCAL}`, value: location(LOCAL, null) as never });
    const relink = op(2, { kind: 'put', path: `point/${POINT}/location_id`, value: LOCAL as never });
    const orphan = op(3, { kind: 'put', path: `point/${OTHER_POINT}/text`, value: 'Ponto de outro aparelho' as never });
    const order = resendRestampOrder([
      { op: orphan, code: 'op_target_missing' },
      { op: relink, code: 'op_target_missing' },
      { op: create, code: 'op_attribution' },
    ]);
    expect(order.map((entry) => entry.op_id)).toEqual([create.op_id, relink.op_id]);
  });

  it('a create, a create that names it, and an edit of the second: all three, in commit order whatever their stamps and the input order', () => {
    const parent = op(1, { kind: 'create', path: `location/${LOCAL}`, value: location(LOCAL, null) as never }, '2026-11-04T12:30:00.000Z');
    const child = op(2, { kind: 'create', path: `location/${CHILD}`, value: location(CHILD, LOCAL) as never }, '2026-11-04T12:10:00.000Z');
    const rename = op(3, { kind: 'put', path: `location/${CHILD}/name`, value: 'Cabine 2' as never }, '2026-11-04T12:05:00.000Z');
    const order = resendRestampOrder([
      { op: rename, code: 'op_target_missing' },
      { op: child, code: 'op_target_missing' },
      { op: parent, code: 'op_attribution' },
    ]);
    expect(order.map((entry) => entry.op_id)).toEqual([parent.op_id, child.op_id, rename.op_id]);
  });

  it('stamps nothing again when no row was refused op_attribution, and never a row of another code', () => {
    const create = op(1, { kind: 'create', path: `location/${LOCAL}`, value: location(LOCAL, null) as never });
    const edit = op(2, { kind: 'put', path: `location/${LOCAL}/name`, value: 'Cabine 1' as never });
    expect(resendRestampOrder([{ op: edit, code: 'op_target_missing' }])).toEqual([]);
    expect(resendRestampOrder([{ op: create, code: 'op_invalid' }, { op: edit, code: 'op_target_missing' }])).toEqual([]);
  });
});
