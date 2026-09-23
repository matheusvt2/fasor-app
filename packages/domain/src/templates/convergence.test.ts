import { describe, expect, it } from 'vitest';
import { applyOp, entityKey, type EntityState } from '../ops/apply.ts';
import { materializeEntity } from '../ops/materialize.ts';
import type { Op } from '../ops/op.ts';
import { templateRowSchema, type TemplateRow } from '../schemas/entities.ts';
import { standardTemplate, templateTotals } from '../seed/template.ts';
import { opFactory, T0 } from '../test-support.ts';
import { composerView, removeNode, setQuantity } from './compose.ts';

/*
 * 3.4-UNIT convergence (deferred-work "Story 3.4 must handle concurrent template edits").
 * Device 1 removes a coluna (skeleton and blocks); device 2, still on the old row, sets a
 * quantity on that coluna (blocks). Folded in either order, `applyOp` never throws, both
 * orders end at the same row, and the orphan block the fold can leave is invisible.
 */

const ID = '019966b0-0036-7000-8000-000000000001';
const COLUNA = 'subsolo-1/coluna-9';
const base = standardTemplate({ id: ID });
const key = entityKey('template', ID);

function fold(ops: readonly Op[]): TemplateRow {
  let state: EntityState = new Map();
  for (const op of ops) state = applyOp(state, op);
  return templateRowSchema.parse(state.get(key));
}

describe('3.4-UNIT concurrent skeleton and blocks edits', () => {
  const f = opFactory(T0);
  const create = f.op({ kind: 'create', scope: 'company', path: `template/${ID}`, value: base });

  // Device 1: remove the coluna, one batch putting both fields.
  const removed = removeNode(base, COLUNA);
  const d1Skeleton = f.op({ scope: 'company', path: `template/${ID}/skeleton`, value: removed.skeleton, device_id: 'device-1' });
  const d1Blocks = f.op({ scope: 'company', path: `template/${ID}/blocks`, value: removed.blocks, device_id: 'device-1' });
  // Device 2, from the old row: one disjuntor on that coluna.
  const d2Blocks = f.op({
    scope: 'company',
    path: `template/${ID}/blocks`,
    value: setQuantity(base, COLUNA, 'disjuntor_mt', 1),
    device_id: 'device-2',
  });

  it('folds device 1 then device 2 without throwing; the orphan is in blocks and nowhere else', () => {
    const row = fold([create, d1Skeleton, d1Blocks, d2Blocks]);
    expect(row.skeleton.some((n) => n.ref === COLUNA)).toBe(false);
    expect(row.blocks.some((b) => b.skeleton_location_ref === COLUNA)).toBe(true);
    const view = composerView(row);
    expect(view.colunaCount).toBe(16);
    expect(templateTotals(row).disjuntor_mt).toBe(templateTotals(base).disjuntor_mt);
  });

  it('folds device 2 then device 1 without throwing, to the same fields each device last wrote', () => {
    const d2First = fold([create, d2Blocks, d1Skeleton, d1Blocks]);
    expect(d2First.skeleton).toEqual(removed.skeleton);
    expect(d2First.blocks).toEqual(removed.blocks);
    expect(composerView(d2First).blockCount).toBe(composerView(fold([create, d1Skeleton, d1Blocks, d2Blocks])).blockCount);
  });

  it('ends at the same row whichever device the server logged last on skeleton, since each field has one writer', () => {
    // Device 2 only ever wrote blocks, so the server's order between d1Skeleton and d2Blocks
    // does not change the row: both orders of those two ops agree.
    const a = fold([create, d1Skeleton, d2Blocks]);
    const b = fold([create, d2Blocks, d1Skeleton]);
    expect(a).toEqual(b);
    expect(materializeEntity({ entity: 'template', id: ID }, [create, d1Skeleton, d2Blocks].map((op, i) => ({ ...op, seq: i + 1 })), [])).toEqual(a);
  });
});
