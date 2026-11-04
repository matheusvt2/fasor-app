import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../ids.ts';
import { companyA, routeHarness } from './rules.test-support.ts';

/*
 * Story 20.7 (contract 29, security pass S1): the server decides which status moves a relatório
 * may make. Every push goes through `POST /api/sync/ops` with a session of Empresa A's user; what a
 * device cannot write (an issue job queued by the generate route, a revision cut by the job) is
 * applied as the server writes it. A refused op is never logged and leaves the row as it was.
 */

const h = routeHarness('tablet-status-rules');
const DEVICE_B = 'tablet-status-rules-b';

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

const statusOf = async (relatorioId: string) => (await h.rowOf<{ status: string }>(companyA, 'relatorio', relatorioId))?.status;

/** A relatório moved, through the paths the web takes, to Em revisão with revision 1: generate queued, Em revisão, the revision cut. */
async function inRevision() {
  const seeded = await h.seedRelatorio(companyA);
  await h.queueIssueJob(companyA, seeded.relatorioId);
  const toRevision = h.statusOp(companyA, seeded.relatorioId, 'em_revisao', null);
  expect((await h.push(companyA, [toRevision])).rejected).toEqual([]);
  await h.cutRevision(companyA, seeded.relatorioId);
  return { ...seeded, toRevision };
}

describe('S1: a forged status is refused, and the server row keeps its status', () => {
  it('a Rascunho put straight to Emitido is refused op_status_transition; the op is never logged', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const forged = h.statusOp(companyA, relatorioId, 'emitido', null);
    const result = await h.push(companyA, [forged]);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual([{ op_id: forged.op_id, code: 'op_status_transition' }]);
    expect(await statusOf(relatorioId)).toBe('rascunho');
    expect(await h.logged(forged.op_id)).toBe(false);
  });

  it('Em revisão with no issue job queued after the last status op is refused; once a generate is queued it applies', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const early = h.statusOp(companyA, relatorioId, 'em_revisao', null);
    expect((await h.push(companyA, [early])).rejected).toEqual([{ op_id: early.op_id, code: 'op_status_transition' }]);
    expect(await statusOf(relatorioId)).toBe('rascunho');

    // From Em campo too (setup completed first), and an issue job created before that status op does not count.
    await h.queueIssueJob(companyA, relatorioId);
    const setupComplete = h.statusOp(companyA, relatorioId, 'em_campo', null);
    expect((await h.push(companyA, [setupComplete])).rejected).toEqual([]);
    const stale = h.statusOp(companyA, relatorioId, 'em_revisao', setupComplete.op_id);
    expect((await h.push(companyA, [stale])).rejected).toEqual([{ op_id: stale.op_id, code: 'op_status_transition' }]);
    expect(await statusOf(relatorioId)).toBe('em_campo');

    await h.queueIssueJob(companyA, relatorioId);
    const generated = h.statusOp(companyA, relatorioId, 'em_revisao', setupComplete.op_id);
    const result = await h.push(companyA, [generated]);
    expect(result.rejected).toEqual([]);
    expect(result.applied.map((a) => a.op_id)).toEqual([generated.op_id]);
    expect(await statusOf(relatorioId)).toBe('em_revisao');
  });

  it('a relatório create born Em campo, Em revisão or Emitido is refused, and no relatório is created', async () => {
    for (const status of ['em_campo', 'em_revisao', 'emitido'] as const) {
      const relatorioId = newId();
      const born = h.clientOp(companyA, {
        kind: 'create',
        path: `relatorio/${relatorioId}`,
        relatorio_id: relatorioId,
        value: {
          id: relatorioId,
          project_id: newId(),
          template_id: null,
          template_version: null,
          seed_version: 'v1',
          status,
          setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
          export: { scheme: 'por_local_e_tipo' },
          preview_file_id: null,
          removed_at: null,
        },
      });
      const result = await h.push(companyA, [born]);
      expect(result.rejected, status).toEqual([{ op_id: born.op_id, code: 'op_status_transition' }]);
      expect(await h.rowOf(companyA, 'relatorio', relatorioId), status).toBeUndefined();
      expect(await h.logged(born.op_id), status).toBe(false);
    }
  });
});

describe('e20f: a forged seen status gains nothing', () => {
  it('once Emitido, now Rascunho and edited since: Em revisão naming the old Emitido op, with no generate, is refused', async () => {
    const { relatorioId, blocks, toRevision } = await inRevision();
    const sent = h.statusOp(companyA, relatorioId, 'emitido', toRevision.op_id);
    expect((await h.push(companyA, [sent])).rejected).toEqual([]);
    const back = h.statusOp(companyA, relatorioId, 'rascunho', sent.op_id);
    expect((await h.push(companyA, [back])).rejected).toEqual([]);
    const edit = h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[0]!.id}/observations`, relatorio_id: relatorioId, value: 'Editado depois de voltar' });
    expect((await h.push(companyA, [edit])).rejected).toEqual([]);
    expect(await statusOf(relatorioId)).toBe('rascunho');

    const forged = h.statusOp(companyA, relatorioId, 'em_revisao', sent.op_id);
    const result = await h.push(companyA, [forged]);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual([{ op_id: forged.op_id, code: 'op_status_transition' }]);
    expect(await statusOf(relatorioId)).toBe('rascunho');
    expect(await h.logged(forged.op_id)).toBe(false);
  });
});

describe('the UI paths apply as before', () => {
  it('setup complete, generate, mark as sent, an edit after Emitido, the backward moves and their Desfazer, and a generate answered unchanged', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    // "Concluir dados do relatório": Rascunho to Em campo.
    const setupComplete = h.statusOp(companyA, relatorioId, 'em_campo', null);
    expect((await h.push(companyA, [setupComplete])).rejected).toEqual([]);
    // A generate queued: Em revisão; the revision arrives.
    await h.queueIssueJob(companyA, relatorioId);
    const generated = h.statusOp(companyA, relatorioId, 'em_revisao', setupComplete.op_id);
    expect((await h.push(companyA, [generated])).rejected).toEqual([]);
    await h.cutRevision(companyA, relatorioId);
    // "Marcar como enviado ao cliente": Emitido.
    const sent = h.statusOp(companyA, relatorioId, 'emitido', generated.op_id);
    expect((await h.push(companyA, [sent])).rejected).toEqual([]);
    expect(await statusOf(relatorioId)).toBe('emitido');
    // Its "Desfazer" steps back, and the "Desfazer" of that steps forward again (a revision exists).
    const undoSent = h.statusOp(companyA, relatorioId, 'em_revisao', sent.op_id);
    const redoSent = h.statusOp(companyA, relatorioId, 'emitido', undoSent.op_id);
    expect((await h.push(companyA, [undoSent])).rejected).toEqual([]);
    expect((await h.push(companyA, [redoSent])).rejected).toEqual([]);
    expect(await statusOf(relatorioId)).toBe('emitido');
    // The Overflow's backward moves, one step each, and "Desfazer" of the last one: nothing edited since revision 1.
    const back1 = h.statusOp(companyA, relatorioId, 'em_revisao', redoSent.op_id);
    const back2 = h.statusOp(companyA, relatorioId, 'em_campo', back1.op_id);
    const undoBack2 = h.statusOp(companyA, relatorioId, 'em_revisao', back2.op_id);
    for (const move of [back1, back2, undoBack2]) expect((await h.push(companyA, [move])).rejected, move.value as string).toEqual([]);
    expect(await statusOf(relatorioId)).toBe('em_revisao');
    // Back to Em campo, then a generate the server answers `unchanged` (no job): Em revisão on the unchanged revision.
    const back3 = h.statusOp(companyA, relatorioId, 'em_campo', undoBack2.op_id);
    expect((await h.push(companyA, [back3])).rejected).toEqual([]);
    const unchanged = h.statusOp(companyA, relatorioId, 'em_revisao', back3.op_id);
    expect((await h.push(companyA, [unchanged])).rejected).toEqual([]);
    const issued = h.statusOp(companyA, relatorioId, 'emitido', unchanged.op_id);
    expect((await h.push(companyA, [issued])).rejected).toEqual([]);
    // An edit after Emitido reopens it as Em revisão in the edit's own batch, and its "Desfazer" closes it again.
    const batchId = newId();
    const edit = h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[0]!.id}/observations`, relatorio_id: relatorioId, value: 'Revisto depois do envio', batch_id: batchId });
    const reopened = h.statusOp(companyA, relatorioId, 'em_revisao', issued.op_id, { batch_id: batchId });
    const reopenedResult = await h.push(companyA, [edit, reopened]);
    expect(reopenedResult.rejected).toEqual([]);
    expect(reopenedResult.applied.map((a) => a.op_id)).toEqual([edit.op_id, reopened.op_id]);
    const undoBatch = newId();
    const undoStatus = h.statusOp(companyA, relatorioId, 'emitido', reopened.op_id, { batch_id: undoBatch });
    const undoEdit = h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[0]!.id}/observations`, relatorio_id: relatorioId, value: null, batch_id: undoBatch, prev_op_id: edit.op_id });
    expect((await h.push(companyA, [undoStatus, undoEdit])).rejected).toEqual([]);
    expect(await statusOf(relatorioId)).toBe('emitido');
  });

  it('the first field value carries Em campo in its batch, and its "Desfazer" puts Rascunho back', async () => {
    const { relatorioId, blocks } = await h.seedRelatorio(companyA);
    const batchId = newId();
    const value = h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[0]!.id}/observations`, relatorio_id: relatorioId, value: 'Primeiro valor', batch_id: batchId });
    const toField = h.statusOp(companyA, relatorioId, 'em_campo', null, { batch_id: batchId });
    expect((await h.push(companyA, [value, toField])).rejected).toEqual([]);
    expect(await statusOf(relatorioId)).toBe('em_campo');
    const undo = h.statusOp(companyA, relatorioId, 'rascunho', toField.op_id);
    expect((await h.push(companyA, [undo])).rejected).toEqual([]);
    expect(await statusOf(relatorioId)).toBe('rascunho');
  });
});

describe('two devices with a stale status: one marks the revision as sent, the other still sees Rascunho', () => {
  it('A first: A applies; B\'s status op is refused and B\'s edit of the same batch applies', async () => {
    const { relatorioId, blocks, toRevision } = await inRevision();
    const sent = h.statusOp(companyA, relatorioId, 'emitido', toRevision.op_id);
    expect((await h.push(companyA, [sent])).rejected).toEqual([]);

    const batchId = newId();
    const edit = h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[1]!.id}/observations`, relatorio_id: relatorioId, value: 'Feito offline', batch_id: batchId, device_id: DEVICE_B });
    const stale = h.statusOp(companyA, relatorioId, 'em_campo', null, { batch_id: batchId, device_id: DEVICE_B });
    const result = await h.push(companyA, [edit, stale]);
    expect(result.applied.map((a) => a.op_id)).toEqual([edit.op_id]);
    expect(result.rejected).toEqual([{ op_id: stale.op_id, code: 'op_status_transition' }]);
    expect(await statusOf(relatorioId)).toBe('emitido');
    expect(((await h.rowOf<{ sheet: { observations: { value: unknown } } }>(companyA, 'block', blocks[1]!.id))?.sheet.observations.value)).toBe('Feito offline');
  });

  it('B first: B\'s status op is refused and its edit applies; then A applies', async () => {
    const { relatorioId, blocks, toRevision } = await inRevision();
    const batchId = newId();
    const edit = h.clientOp(companyA, { kind: 'put', path: `sheet/${blocks[1]!.id}/observations`, relatorio_id: relatorioId, value: 'Feito offline', batch_id: batchId, device_id: DEVICE_B });
    const stale = h.statusOp(companyA, relatorioId, 'em_campo', null, { batch_id: batchId, device_id: DEVICE_B });
    const first = await h.push(companyA, [edit, stale]);
    expect(first.applied.map((a) => a.op_id)).toEqual([edit.op_id]);
    expect(first.rejected).toEqual([{ op_id: stale.op_id, code: 'op_status_transition' }]);
    expect(await statusOf(relatorioId)).toBe('em_revisao');

    const sent = h.statusOp(companyA, relatorioId, 'emitido', toRevision.op_id);
    expect((await h.push(companyA, [sent])).rejected).toEqual([]);
    expect(await statusOf(relatorioId)).toBe('emitido');
  });

  it('review: the "Desfazer" of B\'s refused status op is refused too, so Emitido never steps back to Rascunho', async () => {
    const { relatorioId, toRevision } = await inRevision();
    const sent = h.statusOp(companyA, relatorioId, 'emitido', toRevision.op_id);
    expect((await h.push(companyA, [sent])).rejected).toEqual([]);
    // B, still seeing Rascunho, moves to Em campo and presses "Desfazer" before the refusal comes back.
    const stale = h.statusOp(companyA, relatorioId, 'em_campo', null, { device_id: DEVICE_B });
    const undo = h.statusOp(companyA, relatorioId, 'rascunho', stale.op_id, { device_id: DEVICE_B });
    expect((await h.push(companyA, [stale])).rejected).toEqual([{ op_id: stale.op_id, code: 'op_status_transition' }]);
    // Its basis was never logged: from the server's Emitido it would read as a backward move and apply.
    expect((await h.push(companyA, [undo])).rejected).toEqual([{ op_id: undo.op_id, code: 'op_status_transition' }]);
    expect(await statusOf(relatorioId)).toBe('emitido');
    expect(await h.logged(undo.op_id)).toBe(false);
    // Both in one push, as a device that pressed "Desfazer" before syncing sends them: both refused.
    const staleAgain = h.statusOp(companyA, relatorioId, 'em_campo', null, { device_id: DEVICE_B });
    const undoAgain = h.statusOp(companyA, relatorioId, 'rascunho', staleAgain.op_id, { device_id: DEVICE_B });
    expect((await h.push(companyA, [staleAgain, undoAgain])).rejected).toEqual([
      { op_id: staleAgain.op_id, code: 'op_status_transition' },
      { op_id: undoAgain.op_id, code: 'op_status_transition' },
    ]);
    expect(await statusOf(relatorioId)).toBe('emitido');
  });

  it('a re-sent push whose status op was applied answers its seq again, whatever the status is now', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const setupComplete = h.statusOp(companyA, relatorioId, 'em_campo', null);
    const first = await h.push(companyA, [setupComplete]);
    expect(first.rejected).toEqual([]);
    await h.queueIssueJob(companyA, relatorioId);
    expect((await h.push(companyA, [h.statusOp(companyA, relatorioId, 'em_revisao', setupComplete.op_id)])).rejected).toEqual([]);
    // The device never got its answer and sends the same op again: from Em revisão it would be no row, but it was applied.
    const again = await h.push(companyA, [setupComplete]);
    expect(again.rejected).toEqual([]);
    expect(again.applied).toEqual(first.applied);
  });
});
