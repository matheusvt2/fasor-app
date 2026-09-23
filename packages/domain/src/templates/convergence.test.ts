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
 * Device 1 removes a coluna (a batch putting skeleton and blocks); device 2, still on the
 * old row, sets a quantity on that coluna (a blocks put). Whatever order the server logs
 * them in, both devices folding that log reach the same row, `applyOp` never throws, every
 * row along the way parses, and an orphan block the fold leaves is invisible.
 */

const ID = '019966b0-0036-7000-8000-000000000001';
const COLUNA = 'subsolo-1/coluna-9';
const base = standardTemplate({ id: ID });
const key = entityKey('template', ID);
const ref = { entity: 'template' as const, id: ID };

const f = opFactory(T0);
const create = f.op({ kind: 'create', scope: 'company', path: `template/${ID}`, value: base });
const removed = removeNode(base, COLUNA);
const d1Skeleton = f.op({ scope: 'company', path: `template/${ID}/skeleton`, value: removed.skeleton, device_id: 'device-1' });
const d1Blocks = f.op({ scope: 'company', path: `template/${ID}/blocks`, value: removed.blocks, device_id: 'device-1' });
const d2Blocks = f.op({
  scope: 'company',
  path: `template/${ID}/blocks`,
  value: setQuantity(base, COLUNA, 'disjuntor_mt', 1),
  device_id: 'device-2',
});
const d1 = [d1Skeleton, d1Blocks];
const d2 = [d2Blocks];

/** Folds ops one by one; every intermediate row must parse, and none may throw. */
function foldParsing(ops: readonly Op[]): TemplateRow {
  let state: EntityState = new Map();
  let row: TemplateRow | undefined;
  for (const op of ops) {
    state = applyOp(state, op);
    row = templateRowSchema.parse(state.get(key));
  }
  return row!;
}

const withSeq = (ops: readonly Op[]) => ops.map((op, i) => ({ ...op, seq: i + 1 }));

/** The server's two possible logs: device 1's batch first, or device 2's put first. */
const SERVER_ORDERS: Record<string, Op[]> = {
  'remover first': [create, ...d1, ...d2],
  'stale device first': [create, ...d2, ...d1],
};

describe('3.4-UNIT concurrent skeleton and blocks edits', () => {
  it('every intermediate fold parses in each device\'s own local order, before any sync', () => {
    foldParsing([create, ...d1]);
    foldParsing([create, ...d2]);
  });

  for (const [label, log] of Object.entries(SERVER_ORDERS)) {
    it(`${label}: both devices folding the server log reach deep-equal rows, and every step parses`, () => {
      const server = foldParsing(log);
      const remote = withSeq(log);
      // Each device holds its own ops in its outbox until the pull acks them.
      const onDevice1 = materializeEntity(ref, remote, d1);
      const onDevice2 = materializeEntity(ref, remote, d2);
      expect(onDevice1).toEqual(server);
      expect(onDevice2).toEqual(server);
      expect(onDevice1).toEqual(onDevice2);
      // Mid-pull: a device that has pulled only a prefix of the log still parses at every step.
      for (let n = 1; n <= log.length; n++) {
        expect(templateRowSchema.safeParse(materializeEntity(ref, remote.slice(0, n), d1)).success).toBe(true);
        expect(templateRowSchema.safeParse(materializeEntity(ref, remote.slice(0, n), d2)).success).toBe(true);
      }
      expect(server.skeleton.some((n) => n.ref === COLUNA)).toBe(false);
    });
  }

  it('with the stale device last, the orphan is in blocks and counted nowhere', () => {
    const row = foldParsing(SERVER_ORDERS['remover first']!);
    expect(row.blocks.some((b) => b.skeleton_location_ref === COLUNA)).toBe(true);
    const view = composerView(row);
    expect(view.colunaCount).toBe(16);
    expect(view.totals).toEqual(templateTotals(base));
    expect(templateTotals(row).disjuntor_mt).toBe(templateTotals(base).disjuntor_mt);
  });

  it('with the remover last, no orphan remains', () => {
    const row = foldParsing(SERVER_ORDERS['stale device first']!);
    expect(row.skeleton).toEqual(removed.skeleton);
    expect(row.blocks).toEqual(removed.blocks);
  });
});
