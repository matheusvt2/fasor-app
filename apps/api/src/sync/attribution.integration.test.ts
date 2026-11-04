import { CLOCK_SKEW_MS, formatDateTime, section9Layout } from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { newId } from '../ids.ts';
import { companyA, routeHarness } from './rules.test-support.ts';
import { toSnapshot } from './snapshot.ts';

/*
 * Story 20.8 (contract 29, security pass S3): the server checks who and when an op says. Every
 * push goes through `POST /api/sync/ops` with a session of Empresa A's user; a colleague's own op
 * (their conclusion, their removal) is applied as their device would have, server side, so the
 * history an undo restores exists in the log. A refused op is never logged.
 */

const h = routeHarness('tablet-attribution-rules');
const COLLEAGUE = newId();
const COLLEAGUE_DEVICE = 'tablet-attribution-colleague';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs);

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

type BlockRowLike = { concluded_by: { actor_id: string; at: string } | null; not_tested: unknown; removed_at: string | null };
const blockOf = (id: string) => h.rowOf<BlockRowLike>(companyA, 'block', id);

describe('S3: a value naming another actor than the op\'s', () => {
  it('a concluded_by naming a colleague is refused op_attribution; the sheet keeps its value and the op is never logged', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const forged = h.clientOp(companyA, { kind: 'put', path: `block/${blocks[0]!.id}/concluded_by`, relatorio_id: relatorioId, value: { actor_id: COLLEAGUE, at: '2020-01-01T00:00:00.000Z' } });
    const result = await h.push(companyA, [forged]);
    expect(result.rejected).toEqual([{ op_id: forged.op_id, code: 'op_attribution' }]);
    expect((await blockOf(blocks[0]!.id))?.concluded_by).toBeNull();
    expect(await h.logged(forged.op_id)).toBe(false);

    // The op's own actor, now: applied.
    const own = h.clientOp(companyA, { kind: 'put', path: `block/${blocks[0]!.id}/concluded_by`, relatorio_id: relatorioId, value: { actor_id: companyA.userId, at: new Date().toISOString() } });
    expect((await h.push(companyA, [own])).rejected).toEqual([]);
    expect((await blockOf(blocks[0]!.id))?.concluded_by).toMatchObject({ actor_id: companyA.userId });
  });

  it('not_tested.by and meta.restore.removed_by naming a colleague with no matching history are refused', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const notTested = h.clientOp(companyA, {
      kind: 'put',
      path: `block/${blocks[0]!.id}/not_tested`,
      relatorio_id: relatorioId,
      value: { reason: 'desenergizado_indisponivel', text: null, at: new Date().toISOString(), by: COLLEAGUE },
    });
    const removedAt = new Date().toISOString();
    const restore = h.clientOp(companyA, {
      kind: 'put',
      path: `block/${blocks[1]!.id}/removed_at`,
      relatorio_id: relatorioId,
      value: removedAt,
      meta: { restore: { removed_by: COLLEAGUE, removal_conflict: { removed_by: COLLEAGUE, removed_at: removedAt, edited_by: companyA.userId, edited_at: removedAt } } },
    });
    const result = await h.push(companyA, [notTested, restore]);
    expect(result.rejected).toEqual([
      { op_id: notTested.op_id, code: 'op_attribution' },
      { op_id: restore.op_id, code: 'op_attribution' },
    ]);
    expect((await blockOf(blocks[0]!.id))?.not_tested).toBeNull();
    expect((await blockOf(blocks[1]!.id))?.removed_at).toBeNull();
  });

  it('undo restores history: a value naming a colleague equal to the one their own op wrote on the same path is applied', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const block = blocks[0]!.id;
    const concludedAt = new Date().toISOString();
    // The colleague concludes the sheet on their own device.
    const theirs = h.clientOp(companyA, { kind: 'put', path: `block/${block}/concluded_by`, relatorio_id: relatorioId, value: { actor_id: COLLEAGUE, at: concludedAt }, actor_id: COLLEAGUE, device_id: COLLEAGUE_DEVICE });
    await h.serverApply(companyA, [theirs]);
    // This user reopens it, then presses "Desfazer": the colleague's conclusion comes back.
    const reopen = h.clientOp(companyA, { kind: 'put', path: `block/${block}/concluded_by`, relatorio_id: relatorioId, value: null, prev_op_id: theirs.op_id });
    expect((await h.push(companyA, [reopen])).rejected).toEqual([]);
    const undo = h.clientOp(companyA, { kind: 'put', path: `block/${block}/concluded_by`, relatorio_id: relatorioId, value: { actor_id: COLLEAGUE, at: concludedAt }, prev_op_id: reopen.op_id });
    expect((await h.push(companyA, [undo])).rejected).toEqual([]);
    expect((await blockOf(block))?.concluded_by).toEqual({ actor_id: COLLEAGUE, at: concludedAt });

    // A colleague's removal of a block, put back by the undo of a resolution (`meta.restore`).
    const removedAt = new Date().toISOString();
    const removal = h.clientOp(companyA, { kind: 'put', path: `block/${blocks[1]!.id}/removed_at`, relatorio_id: relatorioId, value: removedAt, actor_id: COLLEAGUE, device_id: COLLEAGUE_DEVICE });
    await h.serverApply(companyA, [removal]);
    const keep = h.clientOp(companyA, { kind: 'put', path: `block/${blocks[1]!.id}/removed_at`, relatorio_id: relatorioId, value: null, prev_op_id: removal.op_id });
    expect((await h.push(companyA, [keep])).rejected).toEqual([]);
    const undoKeep = h.clientOp(companyA, {
      kind: 'put',
      path: `block/${blocks[1]!.id}/removed_at`,
      relatorio_id: relatorioId,
      value: removedAt,
      prev_op_id: keep.op_id,
      meta: { restore: { removed_by: COLLEAGUE, removal_conflict: { removed_by: COLLEAGUE, removed_at: removedAt, edited_by: companyA.userId, edited_at: removedAt } } },
    });
    expect((await h.push(companyA, [undoKeep])).rejected).toEqual([]);
    expect((await blockOf(blocks[1]!.id))?.removed_at).toBe(removedAt);
  });
});

describe('S3 clock: an instant past the server\'s clock or before the relatório\'s creation', () => {
  it('a client_ts or a value instant more than 10 minutes ahead is refused; 9 minutes ahead is applied', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const observation = (when: Date) => h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[0]!.id}/observations`, relatorio_id: relatorioId, value: 'Relógio' }, when);
    const year2099 = observation(new Date('2099-01-01T00:00:00.000Z'));
    const elevenAhead = observation(at(CLOCK_SKEW_MS + MINUTE));
    const nineAhead = observation(at(CLOCK_SKEW_MS - MINUTE));
    const futureValue = h.clientOp(companyA, { kind: 'put', path: `block/${blocks[1]!.id}/concluded_by`, relatorio_id: relatorioId, value: { actor_id: companyA.userId, at: '2099-01-01T00:00:00.000Z' } });
    const result = await h.push(companyA, [year2099, elevenAhead, nineAhead, futureValue]);
    expect(result.rejected).toEqual([
      { op_id: year2099.op_id, code: 'op_attribution' },
      { op_id: elevenAhead.op_id, code: 'op_attribution' },
      { op_id: futureValue.op_id, code: 'op_attribution' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([nineAhead.op_id]);
  });

  it('an instant more than 10 minutes before the relatório\'s creation is refused; 9 minutes before is applied', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const observation = (when: Date) => h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[0]!.id}/observations`, relatorio_id: relatorioId, value: 'Antes' }, when);
    const elevenBefore = observation(at(-(CLOCK_SKEW_MS + MINUTE)));
    const nineBefore = observation(at(-(CLOCK_SKEW_MS - MINUTE)));
    const backdated = h.clientOp(companyA, { kind: 'put', path: `block/${blocks[1]!.id}/concluded_by`, relatorio_id: relatorioId, value: { actor_id: companyA.userId, at: '2020-01-01T00:00:00.000Z' } });
    const result = await h.push(companyA, [elevenBefore, nineBefore, backdated]);
    expect(result.rejected).toEqual([
      { op_id: elevenBefore.op_id, code: 'op_attribution' },
      { op_id: backdated.op_id, code: 'op_attribution' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([nineBefore.op_id]);
  });

  it('offline two days: ops two days old, after the relatório\'s creation, apply, and section 9 prints their dates', async () => {
    const created = at(-3 * DAY);
    const { relatorioId, blocks } = await h.seedRelatorio(companyA, created);
    const twoDaysAgo = at(-2 * DAY);
    const block = blocks[0]!.id;
    const concluded = { actor_id: companyA.userId, at: twoDaysAgo.toISOString() };
    const batchId = newId();
    const offline = [
      h.clientOp(companyA, { kind: 'put', path: `sheet/${block}/observations`, relatorio_id: relatorioId, value: 'Feito sem conexão', batch_id: batchId }, twoDaysAgo),
      h.clientOp(companyA, { kind: 'put', path: `block/${block}/concluded_by`, relatorio_id: relatorioId, value: concluded, batch_id: batchId }, twoDaysAgo),
    ];
    const result = await h.push(companyA, offline);
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual(offline.map((op) => op.op_id));
    expect((await blockOf(block))?.concluded_by).toEqual(concluded);

    const snapshot = await toSnapshot(h.db, asCompanyId(companyA.companyId), relatorioId);
    const printed = JSON.stringify(section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS'));
    expect(printed).toContain(`Concluída por ${companyA.name}`);
    expect(printed).toContain(formatDateTime(twoDaysAgo.toISOString()));
  });
});
