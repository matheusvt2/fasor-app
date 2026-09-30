import 'fake-indexeddb/auto';
import { SERVER_DEVICE_ID, type GenerateResponse, type Op, type RevisionRow } from '@app/domain';
import { BLOCK_CHAVE_ID, EQUIPMENT_CHAVE_ID, portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { act, cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test-axe.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBatch } from '../../db/commit.ts';
import { readGenerateAwaiting } from '../../db/prefs.ts';
import { openDatabase, type AppDatabase, type OutboxRow } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import { newId } from '../../ids.ts';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { makeSyncState, type SyncStateOverrides } from '../../test/sync-state.ts';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { SyncRequestError } from '../../sync/client.ts';
import { ExportDialog } from './export-dialog.tsx';

/*
 * Story 4.8: the Export dialog over a real device database (the small Porto Seguro
 * fixture pulled into Dexie) and a stubbed sync context. The matrix rows Dialog:* are
 * walked one by one: offline, flush wait, 409 retry, 202 and the `generate` status op,
 * the pulled revision (toast, result, `issue` op), the failed job, `unchanged`, the
 * Revisões list, and axe on the idle and result states.
 */

configure({ asyncUtilTimeout: 5000 });

const REL = portoSeguroSmall.relatorioId;
const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const JOB_ID = '019966c1-0000-7000-8000-0000000000e1';
const TIMING = { pollMs: 20, retryMs: 10 };

let database: AppDatabase | null = null;
let counter = 0;

const session = (): SessionState => ({
  status: 'signed-in',
  user: {
    id: USER,
    name: 'Bento Braga',
    email: 'b@teste.local',
    companyId: COMPANY,
    companyName: 'Empresa B de Teste',
    council: null,
    registrationNumber: null,
    title: null,
  },
  online: true,
  reAuthRequired: false,
  aiFeatures: true,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  savePhotoLocation: vi.fn(async () => {}),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

async function freshDb(): Promise<AppDatabase> {
  const user = `019966c1-0049-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  await applyPulled(fresh, portoSeguroSmall.log);
  // Story 7.5: the parecer is set, so "Parecer não preenchido" does not block these issue walks.
  await applyPulled(fresh, [parecerOp()]);
  return fresh;
}

/** The engineer's parecer as a pulled setup put (the fixture's log carries none). */
function parecerOp(): Op {
  return {
    op_id: newId(),
    kind: 'put',
    scope: 'relatorio',
    company_id: COMPANY,
    project_id: null,
    relatorio_id: REL,
    path: 'relatorio/setup/parecer',
    value: { verdict: 'apto', text: null, text_status: null, text_basis: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: USER,
    device_id: 'tablet-other',
    client_ts: '2026-09-23T11:00:00.000Z',
    seq: 19_999,
  };
}

const syncState = (over: SyncStateOverrides = {}): SyncState =>
  makeSyncState({ userNames: { [USER]: 'Bento Braga' }, generate: vi.fn(async () => ({ outcome: 'queued' as const, job_id: JOB_ID, revision_number: 1 })), ...over });

function Harness({ sync, open = true }: { sync: SyncState; open?: boolean }) {
  return (
    <SyncContext value={sync}>
      <ToastProvider>
        <button type="button">Abrir</button>
        <ExportDialog relatorioId={REL} isOpen={open} onOpenChange={() => {}} timing={TIMING} />
        <ToastOutlet />
      </ToastProvider>
    </SyncContext>
  );
}

let seq = 20_000;
function serverOp(input: { kind: Op['kind']; path: string; value: unknown; client_ts: string }): Op {
  return {
    op_id: newId(),
    kind: input.kind,
    scope: 'relatorio',
    company_id: COMPANY,
    project_id: null,
    relatorio_id: REL,
    path: input.path,
    value: input.value as Op['value'],
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: 'system:generate',
    device_id: SERVER_DEVICE_ID,
    client_ts: input.client_ts,
    seq: ++seq,
  };
}

const jobOps = (status: 'queued' | 'running' | 'done' | 'failed', jobId = JOB_ID, createdAt = new Date().toISOString()): Op[] => [
  serverOp({
    kind: 'create',
    path: `generation_job/${jobId}`,
    // Created "now" by default: a job older than the queue expiry no longer counts as running (`isJobActive`).
    value: { id: jobId, relatorio_id: REL, kind: 'issue', status: 'queued', error: null, result_file_id: null, result: null, created_at: createdAt },
    client_ts: '2026-09-23T12:00:00.000Z',
  }),
  ...(status === 'queued' ? [] : [serverOp({ kind: 'put', path: `generation_job/${jobId}/status`, value: status, client_ts: '2026-09-23T12:00:01.000Z' })]),
];

function revisionOf(number: number): { row: RevisionRow; op: Op } {
  const row: RevisionRow = {
    id: newId(),
    relatorio_id: REL,
    number,
    // The head of the log when the revision is cut: every op pulled so far is in its snapshot.
    snapshot_seq: seq,
    created_by: USER,
    docx_file_id: newId(),
    pdf_file_id: newId(),
    created_at: '2026-09-23T12:00:30.000Z',
  };
  return { row, op: serverOp({ kind: 'create', path: `revision/${row.id}`, value: row, client_ts: row.created_at }) };
}

const dialog = () => screen.getByRole('dialog');
/** The primary: "Gerar relatório", or "Gerando…" while it sends and the job runs. */
const generateButton = () => within(dialog()).getByRole('button', { name: /^(Gerar relatório|Gerando…)$/ });

/**
 * E11-Q1: stubs `fetch` (the revision file's bytes), the object URL and the anchor click
 * that saves a file, recording each saved name. `hold()` keeps the next fetch pending.
 */
function recordSaves() {
  const names: string[] = [];
  let gate: Promise<void> | null = null;
  const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () => {
    if (gate !== null) await gate;
    return new Response('bytes', { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:saved';
  URL.revokeObjectURL = () => undefined;
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
  return {
    names,
    fetch,
    hold() {
      let open = () => {};
      gate = new Promise<void>((resolve) => {
        open = () => {
          gate = null;
          resolve();
        };
      });
      return { release: () => open() };
    },
    restore() {
      vi.unstubAllGlobals();
      click.mockRestore();
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
    },
  };
}
const statusOps = async (db: AppDatabase): Promise<unknown[]> =>
  (await db.outbox.where('path').equals('relatorio/status').toArray()).sort((a: OutboxRow, b: OutboxRow) => (a.client_ts < b.client_ts ? -1 : 1)).map((r) => r.value);

afterEach(async () => {
  cleanup();
  await database?.close();
  database = null;
});

describe('Export dialog (Story 4.8)', () => {
  it('is a labelled modal that waits for a connection: offline, the button carries the reason and nothing is called', async () => {
    database = await freshDb();
    const sync = syncState({ online: false });
    render(<Harness sync={sync} />);
    const modal = dialog();
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveAttribute('aria-labelledby', 'export-title');
    expect(within(modal).getByRole('heading', { level: 2, name: 'Gerar relatório' })).toBeInTheDocument();
    const button = generateButton();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(within(modal).getByText('Gerar relatório precisa de conexão. Conecte e tente de novo.')).toHaveClass('btn-reason');
    await userEvent.click(button);
    expect(sync.generate).not.toHaveBeenCalled();
    expect(sync.syncNow).not.toHaveBeenCalled();
    expect(within(modal).getByText('Nenhuma revisão gerada ainda.')).toBeInTheDocument();
    expect(await axe(modal)).toHaveNoViolations();
  });

  it('shows the idle reason with the next number beside the enabled button', async () => {
    database = await freshDb();
    render(<Harness sync={syncState()} />);
    expect(generateButton()).not.toHaveAttribute('aria-disabled');
    expect(within(dialog()).getByText('Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 1. Precisa de conexão.')).toHaveClass('btn-reason');
  });

  it('drains the outbox first ("Enviando…") and only then sends the request with the device op and the expected files', async () => {
    database = await freshDb();
    const pending = syncState({ counts: { pending: 2 } });
    const { rerender } = render(<Harness sync={pending} />);
    await userEvent.click(generateButton());
    // The cycle is asked for at once (and again after `retryMs` while the outbox stays
    // pending: the kick that keeps a stalled cycle moving, so the count is "at least once").
    expect(pending.syncNow).toHaveBeenCalled();
    await waitFor(() => expect(generateButton()).toHaveAttribute('aria-disabled', 'true'));
    expect(within(dialog()).getByText('Enviando…')).toHaveClass('btn-reason');
    // Matheus, 2026-09-30: the waiting button says so.
    expect(generateButton()).toHaveTextContent('Gerando…');
    await new Promise((resolve) => setTimeout(resolve, TIMING.retryMs * 3));
    expect(pending.generate).not.toHaveBeenCalled();

    // The cycle drains the outbox: the request goes out.
    const drained = syncState({ generate: pending.generate, syncNow: pending.syncNow, syncRelatorio: pending.syncRelatorio });
    rerender(<Harness sync={drained} />);
    await waitFor(() => expect(pending.generate).toHaveBeenCalledTimes(1));
    expect(pending.generate).toHaveBeenCalledWith(REL, { last_op_id: null, file_ids_expected: [] });
  });

  it('stops on a dead op with the sentence beside the re-enabled button', async () => {
    database = await freshDb();
    const dead = syncState({ counts: { dead: 1 } });
    render(<Harness sync={dead} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(within(dialog()).getByText('Há alterações rejeitadas — resolva em Sincronização antes de gerar.')).toBeInTheDocument());
    expect(generateButton()).not.toHaveAttribute('aria-disabled');
    expect(dead.generate).not.toHaveBeenCalled();
  });

  it('answers a 409 with a sync and a retry, then a 202 turns into the working state and the generate status op', async () => {
    database = await freshDb();
    const generate = vi
      .fn<SyncState['generate']>()
      .mockRejectedValueOnce(new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up' }))
      .mockResolvedValueOnce({ outcome: 'queued', job_id: JOB_ID, revision_number: 1 });
    const sync = syncState({ generate });
    render(<Harness sync={sync} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    // One sync before the flush, one after the 409.
    expect(sync.syncNow).toHaveBeenCalledTimes(2);

    const modal = dialog();
    await waitFor(() => expect(within(modal).getByRole('status')).toHaveTextContent('Gerando revisão 1…'));
    expect(within(modal).getByRole('status')).toHaveTextContent('pode fechar — o aviso chega quando terminar');
    expect(modal.querySelector('.gen-progress .progress-counter[data-state="pending"] .dot')).not.toBeNull();
    expect(generateButton()).toHaveAttribute('aria-disabled', 'true');
    expect(within(modal).getByText('Gerando a revisão 1 — DOCX e PDF juntos')).toHaveClass('btn-reason');
    // Em campo --generate--> Em revisão, written as the device's op.
    await waitFor(async () => expect(await statusOps(database!)).toEqual(['em_revisao']));
    // The stream is polled while it works.
    await waitFor(() => expect(sync.syncRelatorio).toHaveBeenCalled());
  });

  it('turns the pulled revision into the toast, the result block, the issue op, and lists it under Revisões', async () => {
    database = await freshDb();
    const sync = syncState();
    render(<Harness sync={sync} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(within(dialog()).getByRole('status')).toHaveTextContent('Gerando revisão 1…'));

    // The server's job runs and the revision is pulled.
    const { row, op } = revisionOf(1);
    await act(async () => {
      await applyPulled(database!, [...jobOps('done'), op]);
    });

    const modal = dialog();
    await waitFor(() => expect(within(modal).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeInTheDocument());
    expect(screen.getByTestId('toast')).toHaveTextContent('Revisão 1 pronta — DOCX e PDF');
    expect(modal.querySelector('.t-meta time')).toHaveAttribute('datetime', row.created_at);
    expect(modal.querySelector('p.t-meta')).toHaveTextContent('23/09/2026 09:00 · Bento Braga');
    expect(within(modal).getByRole('button', { name: 'DOCX — abrir no Word' })).toHaveClass('rr-open');
    // Story 11.1: the second result row, the PDF for the client.
    expect(within(modal).getByRole('button', { name: 'PDF — enviar ao cliente' })).toHaveClass('rr-open');
    expect(modal.querySelectorAll('.result-block .result-row')).toHaveLength(2);
    // No share sheet in this browser: neither share button renders.
    expect(within(modal).queryByRole('button', { name: 'Compartilhar DOCX' })).toBeNull();
    expect(within(modal).queryByRole('button', { name: 'Compartilhar PDF' })).toBeNull();
    expect(within(modal).getByText('Qualquer alteração a partir de agora gera a revisão 2.')).toBeInTheDocument();
    // Em revisão --issue--> Emitido, the device's second op; the pill follows the row.
    await waitFor(async () => expect(await statusOps(database!)).toEqual(['em_revisao', 'emitido']));
    await waitFor(() => expect(modal.querySelector('.row-wrap .status-pill')).toHaveTextContent('Emitido'));

    // The Revisões list: "Rev. 1 — dd/mm/aaaa hh:mm — Bento Braga" with a DOCX and a PDF button.
    const rowElement = modal.querySelector('.revision-row')!;
    expect(rowElement.querySelector('.rev-text')).toHaveTextContent('Rev. 1 — 23/09/2026 09:00 — Bento Braga');
    expect(rowElement.querySelector('.rev-text time')).toHaveAttribute('datetime', row.created_at);
    expect(within(rowElement as HTMLElement).getByRole('button', { name: 'DOCX' })).toHaveClass('btn-text');
    expect(within(rowElement as HTMLElement).getByRole('button', { name: 'PDF' })).toHaveClass('btn-text');

    // E11-Q1: each saves the file itself, fetched with the session: relatorio-rev-1.docx and .pdf.
    const saved = recordSaves();
    try {
      await userEvent.click(within(modal).getByRole('button', { name: 'DOCX — abrir no Word' }));
      await waitFor(() => expect(saved.names).toEqual(['relatorio-rev-1.docx']));
      expect(saved.fetch).toHaveBeenLastCalledWith(`/api/revisions/${row.id}/docx`, expect.objectContaining({ credentials: 'same-origin' }));
      await userEvent.click(within(modal).getByRole('button', { name: 'PDF — enviar ao cliente' }));
      await waitFor(() => expect(saved.names).toEqual(['relatorio-rev-1.docx', 'relatorio-rev-1.pdf']));
      expect(saved.fetch).toHaveBeenLastCalledWith(`/api/revisions/${row.id}/pdf`, expect.anything());
    } finally {
      saved.restore();
    }

    expect(await axe(modal)).toHaveNoViolations();

    // "Gerar de novo" goes back to idle. Nothing was edited since revision 1 (its status ops
    // are not edits, AD-15), so a press would answer revision 1 again and the line says so (Q11).
    await userEvent.click(within(modal).getByRole('button', { name: 'Gerar de novo' }));
    await waitFor(() => expect(within(modal).getByText('Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 1. Precisa de conexão.')).toBeInTheDocument());
    // An edit on this device, not yet sent: the next press cuts revision 2.
    await act(async () => {
      await commitBatch(
        database!,
        [
          {
            kind: 'put',
            scope: 'relatorio',
            company_id: COMPANY,
            project_id: null,
            relatorio_id: REL,
            path: 'relatorio/setup/local',
            value: 'Outro local',
            prev_op_id: null,
            batch_id: null,
            meta: null,
            actor_id: USER,
          },
        ],
        { newId, now: () => new Date() },
      );
    });
    await waitFor(() => expect(within(modal).getByText('Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 2. Precisa de conexão.')).toBeInTheDocument());
  });

  it('E4 retro item 19: an edit made while the job runs keeps the relatório Em revisão; revision 1 is ready and the idle line names revision 2', async () => {
    database = await freshDb();
    render(<Harness sync={syncState()} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(within(dialog()).getByRole('status')).toHaveTextContent('Gerando revisão 1…'));
    await waitFor(async () => expect(await statusOps(database!)).toEqual(['em_revisao']));

    // The revision's snapshot is cut now; a setup edit lands after it, before the revision arrives.
    const { op } = revisionOf(1);
    await act(async () => {
      await commitBatch(
        database!,
        [
          {
            kind: 'put',
            scope: 'relatorio',
            company_id: COMPANY,
            project_id: null,
            relatorio_id: REL,
            path: 'relatorio/setup/local',
            value: 'Local editado durante a geração',
            prev_op_id: null,
            batch_id: null,
            meta: null,
            actor_id: USER,
          },
        ],
        { newId, now: () => new Date() },
      );
      await applyPulled(database!, [...jobOps('done'), op]);
    });

    const modal = dialog();
    await waitFor(() => expect(within(modal).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeInTheDocument());
    // No `issue` op: the revision lacks the edit.
    await waitFor(() => expect(modal.querySelector('.row-wrap .status-pill')).toHaveTextContent('Em revisão'));
    expect(await statusOps(database!)).toEqual(['em_revisao']);
    await userEvent.click(within(modal).getByRole('button', { name: 'Gerar de novo' }));
    await waitFor(() => expect(within(modal).getByText('Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 2. Precisa de conexão.')).toBeInTheDocument());
  });

  /** Revision 1 generated and pulled, then "Gerar de novo": the idle line names revision 1. */
  async function afterRevisionOne(): Promise<HTMLElement> {
    database = await freshDb();
    render(<Harness sync={syncState()} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(within(dialog()).getByRole('status')).toHaveTextContent('Gerando revisão 1…'));
    await act(async () => {
      await applyPulled(database!, [...jobOps('done'), revisionOf(1).op]);
    });
    const modal = dialog();
    await waitFor(() => expect(within(modal).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeInTheDocument());
    await waitFor(async () => expect(await statusOps(database!)).toEqual(['em_revisao', 'emitido']));
    await userEvent.click(within(modal).getByRole('button', { name: 'Gerar de novo' }));
    await waitFor(() => expect(within(modal).getByText('Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 1. Precisa de conexão.')).toBeInTheDocument());
    return modal;
  }

  /** An edit another device made, pulled with a seq past the revision's snapshot (nothing in this device's outbox). */
  const pulledEdit = (input: { scope: 'relatorio' | 'project'; path: string; value: unknown }): Op => ({
    ...serverOp({ kind: 'put', path: input.path, value: input.value, client_ts: '2026-09-23T12:05:00.000Z' }),
    scope: input.scope,
    project_id: input.scope === 'project' ? portoSeguroSmall.projectId : null,
    relatorio_id: input.scope === 'relatorio' ? REL : null,
    actor_id: USER,
    device_id: 'outro-aparelho',
  });

  it('Q11: a pulled edit of the relatório past the snapshot moves the idle line to revision 2', async () => {
    const modal = await afterRevisionOne();
    await act(async () => {
      await applyPulled(database!, [pulledEdit({ scope: 'relatorio', path: 'relatorio/setup/local', value: 'Outro local' })]);
    });
    await waitFor(() => expect(within(modal).getByText('Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 2. Precisa de conexão.')).toBeInTheDocument());
    expect(await database!.outbox.where('path').equals('relatorio/setup/local').count()).toBe(0);
  });

  it('Q11: a pulled project-scope edit (an equipment TAG) past the snapshot moves the idle line to revision 2', async () => {
    const modal = await afterRevisionOne();
    await act(async () => {
      await applyPulled(database!, [pulledEdit({ scope: 'project', path: `equipment/${EQUIPMENT_CHAVE_ID}/tag`, value: 'SEC-NOVA' })]);
    });
    await waitFor(() => expect(within(modal).getByText('Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 2. Precisa de conexão.')).toBeInTheDocument());
  });

  it('Q11: the ready pill reads the status after the issue op, even when the revision lands before the relatório row is read', async () => {
    database = await freshDb();
    const sync = syncState();
    const { unmount } = render(<Harness sync={sync} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(within(dialog()).getByRole('status')).toHaveTextContent('Gerando revisão 1…'));
    await waitFor(async () => expect(await statusOps(database!)).toEqual(['em_revisao']));
    unmount();
    // The revision is already on the device when the dialog mounts again: the resume path
    // finishes it in the first renders, while the live relatório row may still be unread.
    const { op } = revisionOf(1);
    await applyPulled(database, [...jobOps('done'), op]);
    render(<Harness sync={sync} />);
    const modal = dialog();
    await waitFor(() => expect(within(modal).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeInTheDocument());
    // The ready state never shows the status before the issue op.
    expect(modal.querySelector('.row-wrap .status-pill')).not.toHaveTextContent('Em revisão');
    await waitFor(() => expect(modal.querySelector('.row-wrap .status-pill')).toHaveTextContent('Emitido'));
    expect(await statusOps(database!)).toEqual(['em_revisao', 'emitido']);
  });

  it('shows the inline error with "Tentar novamente" when the job fails, and a network failure ends the same way', async () => {
    database = await freshDb();
    const sync = syncState();
    render(<Harness sync={sync} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(within(dialog()).getByRole('status')).toHaveTextContent('Gerando revisão 1…'));
    await act(async () => {
      await applyPulled(database!, jobOps('failed'));
    });
    const modal = dialog();
    await waitFor(() => expect(within(modal).getByRole('alert')).toHaveTextContent('Não foi possível gerar o relatório. Os dados não foram alterados e nenhuma revisão foi criada.'));
    expect(within(modal).getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(generateButton()).not.toHaveAttribute('aria-disabled');
    // The mock's shorter reason under the failed line.
    expect(within(modal).getByText('Gera o DOCX e o PDF juntos, como a revisão 1. Precisa de conexão.')).toHaveClass('btn-reason');
    expect(await statusOps(database!)).toEqual(['em_revisao']);

    // "Tentar novamente" asks again; a request that never completes fails inline too.
    (sync.generate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new SyncRequestError({ kind: 'network' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(sync.generate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument());
  });

  it('stops waiting when the running job outlives the queue expiry (a worker that died never writes failed)', async () => {
    database = await freshDb();
    render(<Harness sync={syncState()} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(within(dialog()).getByRole('status')).toHaveTextContent('Gerando revisão 1…'));
    expect(await readGenerateAwaiting(database, REL)).not.toBeNull();
    // The pulled job row: running, created 900 s minus 300 ms ago, so it expires almost at once.
    await act(async () => {
      await applyPulled(database!, jobOps('running', JOB_ID, new Date(Date.now() - 900_000 + 300).toISOString()));
    });
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent('Não foi possível gerar o relatório.'), { timeout: 3000 });
    expect(generateButton()).not.toHaveAttribute('aria-disabled');
    await waitFor(async () => expect(await readGenerateAwaiting(database!, REL)).toBeNull());
  });

  it('E4 retro item 20 (was: no op): "unchanged" answers the existing revision with no toast, and an Em campo relatório takes generate then issue, Emitido', async () => {
    database = await freshDb();
    const { row, op } = revisionOf(1);
    await applyPulled(database, [...jobOps('done'), op]);
    const answer: GenerateResponse = { outcome: 'unchanged', revision_id: row.id, revision_number: 1 };
    const sync = syncState({ generate: vi.fn(async () => answer) });
    render(<Harness sync={sync} />);
    await userEvent.click(generateButton());
    const modal = dialog();
    await waitFor(() => expect(within(modal).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeInTheDocument());
    expect(screen.queryByTestId('toast')).toBeNull();
    // The fixture is Em campo (moved back past Em revisão after an issue): the same table
    // path as an arrived revision, Em campo --generate--> Em revisão --issue--> Emitido.
    await waitFor(async () => expect(await statusOps(database!)).toEqual(['em_revisao', 'emitido']));
    await waitFor(() => expect(modal.querySelector('.row-wrap .status-pill')).toHaveTextContent('Emitido'));
    expect(modal.querySelectorAll('.revision-row')).toHaveLength(1);
  });

  it('sends the device\'s newest op and the files it expects: a committed setup put, and a pulled photo row left out (photos never block Gerar)', async () => {
    database = await freshDb();
    const put = await commitBatch(
      database,
      [
        {
          kind: 'put',
          scope: 'relatorio',
          company_id: COMPANY,
          project_id: null,
          relatorio_id: REL,
          path: 'relatorio/setup/local',
          value: 'Torre A',
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: USER,
        },
      ],
      { newId, now: () => new Date('2026-09-23T11:00:00.000Z') },
    );
    const photoId = newId();
    await applyPulled(database, [
      serverOp({
        kind: 'create',
        path: `file/${photoId}`,
        value: {
          id: photoId,
          company_id: COMPANY,
          relatorio_id: REL,
          kind: 'photo',
          sha256: 'ab'.repeat(32),
          mime: 'image/jpeg',
          size: 10,
          uploaded_at: '2026-09-23T11:05:00.000Z',
          variants: null,
          removed_at: null,
          captured_at: '2026-09-06T12:00:00.000Z',
          tz_offset: -180,
          coords: null,
          local_seq: 1,
          block_id: BLOCK_CHAVE_ID,
          item_key: null,
          caption: null,
          reading_kind: null,
          reading_target: null,
          reading_status: 'none',
        },
        client_ts: '2026-09-23T11:05:00.000Z',
      }),
    ]);
    // The outbox row is acked (the cycle would have pushed it): counts are zero.
    await database.outbox.update(put.ops[0]!.op_id, { status: 'acked', seq: 5000 });
    const sync = syncState();
    render(<Harness sync={sync} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(sync.generate).toHaveBeenCalledTimes(1));
    // Coordinator decision 2026-09-25: the job renders with the photos the server holds.
    expect(sync.generate).toHaveBeenCalledWith(REL, { last_op_id: put.ops[0]!.op_id, file_ids_expected: [] });
  });

  it('gives up after ten 409 answers with the inline error, and after ten flush rounds that never drain', async () => {
    database = await freshDb();
    const generate = vi.fn<SyncState['generate']>().mockRejectedValue(new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up' }));
    const { unmount } = render(<Harness sync={syncState({ generate })} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toBeInTheDocument());
    expect(generate).toHaveBeenCalledTimes(10);
    unmount();

    const stuck = syncState({ counts: { pending: 1 }, running: false });
    render(<Harness sync={stuck} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toBeInTheDocument());
    expect(stuck.generate).not.toHaveBeenCalled();
    expect((stuck.syncNow as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(10);
  });

  it('E9 sweep B14: fails at once when the 409 names only files no upload here will bring, and names how many', async () => {
    database = await freshDb();
    const missing = [newId(), newId()];
    const generate = vi
      .fn<SyncState['generate']>()
      .mockRejectedValue(new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up', details: { missing_op: false, missing_files: missing } }));
    const sync = syncState({ generate });
    const { unmount } = render(<Harness sync={sync} />);
    await userEvent.click(generateButton());
    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível gerar o relatório. Os dados não foram alterados e nenhuma revisão foi criada.');
    expect(alert).toHaveTextContent('2 arquivos ainda não chegaram ao servidor');
    // No blind retry: one request, and only the flush's sync.
    expect(generate).toHaveBeenCalledTimes(1);
    expect(sync.syncNow).toHaveBeenCalledTimes(1);
    unmount();

    // An op still missing: retried as before, and the retry succeeds.
    const retried = vi
      .fn<SyncState['generate']>()
      .mockRejectedValueOnce(new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up', details: { missing_op: true, missing_files: missing } }))
      .mockResolvedValueOnce({ outcome: 'queued', job_id: JOB_ID, revision_number: 1 });
    render(<Harness sync={syncState({ generate: retried })} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(within(dialog()).getByRole('status')).toHaveTextContent('Gerando revisão 1…'));
    expect(retried).toHaveBeenCalledTimes(2);
  });

  /**
   * A photo this device still has to upload: its blob, its row with no `uploaded_at` and
   * its acked create (`pendingUploads`). `dead` marks the upload as one no cycle retries.
   */
  async function plantUpload(db: AppDatabase, fileId: string, dead: boolean): Promise<void> {
    const create = serverOp({
      kind: 'create',
      path: `file/${fileId}`,
      value: {
        id: fileId,
        company_id: COMPANY,
        relatorio_id: REL,
        kind: 'photo',
        sha256: 'cd'.repeat(32),
        mime: 'image/jpeg',
        size: 10,
        uploaded_at: null,
        variants: null,
        removed_at: null,
        captured_at: '2026-09-06T12:00:00.000Z',
        tz_offset: -180,
        coords: null,
        local_seq: 1,
        block_id: BLOCK_CHAVE_ID,
        item_key: null,
        caption: null,
        reading_kind: null,
        reading_target: null,
        reading_status: 'none',
      },
      client_ts: '2026-09-23T11:05:00.000Z',
    });
    await applyPulled(db, [create]);
    await db.outbox.put({ ...create, status: 'acked', error_code: null, targets: [`file:${fileId}`] } as OutboxRow);
    await db.files.put({
      id: fileId,
      variant: 'original',
      blob: new Blob(['abcd']),
      acked: false,
      created_at: '2026-09-23T11:05:00.000Z',
      ...(dead ? { upload_error: { state: 'dead' as const, code: 'file_too_large', at: '2026-09-23T11:06:00.000Z' } } : {}),
    });
  }

  it('E9 sweep B14: retries while a file the 409 names is still on its way from this device, and fails at once once that upload is dead', async () => {
    database = await freshDb();
    const fileId = newId();
    const notCaughtUp = new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up', details: { missing_op: false, missing_files: [fileId] } });
    // The upload appears after the first press, as a photo taken while the dialog was open.
    const retried = vi
      .fn<SyncState['generate']>()
      .mockImplementationOnce(async () => {
        await plantUpload(database!, fileId, false);
        throw notCaughtUp;
      })
      .mockResolvedValueOnce({ outcome: 'queued', job_id: JOB_ID, revision_number: 1 });
    const { unmount } = render(<Harness sync={syncState({ generate: retried })} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(within(dialog()).getByRole('status')).toHaveTextContent('Gerando revisão 1…'));
    expect(retried).toHaveBeenCalledTimes(2);
    unmount();
    cleanup();
    database.close();

    database = await freshDb();
    const deadId = newId();
    const refused = vi.fn<SyncState['generate']>().mockImplementationOnce(async () => {
      await plantUpload(database!, deadId, true);
      throw new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up', details: { missing_op: false, missing_files: [deadId] } });
    });
    render(<Harness sync={syncState({ generate: refused })} />);
    await userEvent.click(generateButton());
    const alert = await within(dialog()).findByRole('alert');
    expect(alert).toHaveTextContent('1 arquivo ainda não chegou ao servidor');
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('honours "pode fechar": the wait survives an unmount, and a remount after the revision arrived finishes it', async () => {
    database = await freshDb();
    const sync = syncState();
    const { unmount } = render(<Harness sync={sync} />);
    await userEvent.click(generateButton());
    await waitFor(() => expect(within(dialog()).getByRole('status')).toHaveTextContent('Gerando revisão 1…'));
    expect(await readGenerateAwaiting(database, REL)).toEqual({ number: 1, job_id: JOB_ID });
    unmount();

    // The job finishes while nothing is mounted; the pull brings the revision.
    const { op } = revisionOf(1);
    await applyPulled(database, [...jobOps('done'), op]);

    render(<Harness sync={sync} />);
    const modal = dialog();
    await waitFor(() => expect(within(modal).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeInTheDocument());
    expect(screen.getByTestId('toast')).toHaveTextContent('Revisão 1 pronta — DOCX e PDF');
    await waitFor(async () => expect(await statusOps(database!)).toEqual(['em_revisao', 'emitido']));
    await waitFor(async () => expect(await readGenerateAwaiting(database!, REL)).toBeNull());
  });

  it('finishes with the newest revision when the job is done but no revision carries the waited number', async () => {
    database = await freshDb();
    // A job the server already runs, resumed with the stale local number 1...
    await applyPulled(database, jobOps('running'));
    const sync = syncState();
    render(<Harness sync={sync} />);
    await waitFor(() => expect(within(dialog()).getByRole('status')).toHaveTextContent('Gerando revisão 1…'));
    // ...while the server allocates number 2 (a revision this device never pulled came first).
    const { op } = revisionOf(2);
    await act(async () => {
      await applyPulled(database!, [serverOp({ kind: 'put', path: `generation_job/${JOB_ID}/status`, value: 'done', client_ts: '2026-09-23T12:00:40.000Z' }), op]);
    });
    await waitFor(() => expect(within(dialog()).getByRole('heading', { level: 2, name: 'Revisão 2 pronta' })).toBeInTheDocument());
  });

  it('waits with a reason for a revision the server named but this device has not pulled, then enables the row', async () => {
    database = await freshDb();
    const { row, op } = revisionOf(1);
    const answer: GenerateResponse = { outcome: 'unchanged', revision_id: row.id, revision_number: 1 };
    const sync = syncState({ generate: vi.fn(async () => answer) });
    render(<Harness sync={sync} />);
    await userEvent.click(generateButton());
    const modal = dialog();
    await waitFor(() => expect(within(modal).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeInTheDocument());
    const open = within(modal).getByRole('button', { name: 'DOCX — abrir no Word' });
    expect(open).toHaveAttribute('aria-disabled', 'true');
    expect(open).toHaveAccessibleDescription('Baixando a revisão…');
    expect(modal.querySelector('.result-row .btn-reason')).toHaveTextContent('Baixando a revisão…');
    // Story 11.1: the PDF row waits on the same revision, described by the same reason, and a press opens nothing.
    const openPdf = within(modal).getByRole('button', { name: 'PDF — enviar ao cliente' });
    expect(openPdf).toHaveAttribute('aria-disabled', 'true');
    expect(openPdf).toHaveAccessibleDescription('Baixando a revisão…');
    expect(modal.querySelectorAll('.result-row .btn-reason')).toHaveLength(1);
    const saved = recordSaves();
    await userEvent.click(openPdf);
    expect(saved.fetch).not.toHaveBeenCalled();
    saved.restore();
    await waitFor(() => expect(sync.syncRelatorio).toHaveBeenCalled());

    await act(async () => {
      await applyPulled(database!, [...jobOps('done'), op]);
    });
    await waitFor(() => expect(within(modal).getByRole('button', { name: 'DOCX — abrir no Word' })).not.toHaveAttribute('aria-disabled'));
    expect(within(modal).getByRole('button', { name: 'PDF — enviar ao cliente' })).not.toHaveAttribute('aria-disabled');
    expect(modal.querySelector('.result-row .btn-reason')).toBeNull();
    expect(modal.querySelector('p.t-meta')).toHaveTextContent('23/09/2026 09:00 · Bento Braga');
  });

  it('resumes the working state from a job the server still runs, whoever asked for it', async () => {
    database = await freshDb();
    await applyPulled(database, jobOps('running'));
    const sync = syncState();
    render(<Harness sync={sync} />);
    const modal = dialog();
    await waitFor(() => expect(within(modal).getByRole('status')).toHaveTextContent('Gerando revisão 1…'));
    expect(generateButton()).toHaveAttribute('aria-disabled', 'true');
    await waitFor(() => expect(sync.syncRelatorio).toHaveBeenCalled());
  });
});

describe('Export dialog (Story 7.5)', () => {
  it('lists "Antes de emitir": the count of the Sumário warnings with "Ver no sumário", rejected ops with "Reenviar", and the document control as a dl', async () => {
    database = await freshDb();
    const onSee = vi.fn();
    const sync = syncState({ counts: { dead: 2 } });
    render(
      <SyncContext value={sync}>
        <ToastProvider>
          <ExportDialog relatorioId={REL} isOpen onOpenChange={() => {}} onSeeInSumario={onSee} onEditInSetup={() => {}} timing={TIMING} />
        </ToastProvider>
      </SyncContext>,
    );
    const modal = dialog();
    const list = await waitFor(() => {
      const found = modal.querySelector('ul.precheck');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    // The parecer is set in this fixture: nothing blocks.
    expect(list.querySelector('li.is-blocking')).toBeNull();
    expect(within(list).getByText('2 alterações rejeitadas')).toBeVisible();
    await userEvent.click(within(list).getByRole('button', { name: 'Reenviar' }));
    expect(sync.resendDead).toHaveBeenCalledTimes(1);
    const count = [...list.querySelectorAll('li')].at(-1)!;
    expect(count.querySelector('.pc-text')).toHaveTextContent(/^\d+ avisos? — estão nas linhas do sumário; nenhum impede gerar\.$/);
    await userEvent.click(within(count).getByRole('button', { name: 'Ver no sumário' }));
    expect(onSee).toHaveBeenCalledWith(expect.arrayContaining(['section_9']));
    // Document control: a dl of the kernel's rows, "Rev. 1" the next number, "—" for a missing value.
    const dl = modal.querySelector('dl.doc-control')!;
    expect(dl).toHaveAccessibleName('Controle do documento — impresso após a capa');
    const pairs = [...dl.querySelectorAll('.dc-row')].map((row) => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent]);
    expect(pairs.map(([label]) => label)).toEqual(['Documento', 'Revisão do documento', 'Data de emissão', 'Contratante', 'Contratada', 'Responsável técnico', 'ART/TRT', 'Período do serviço']);
    expect(pairs[1]![1]).toBe('Rev. 1');
    expect(modal.querySelector('.export-sec9-note')).toHaveTextContent('Seção 9 impressa no agrupamento do FO.SERV-03 (por local e tipo, com a flag Agrupar por tipo de cada cabine).');
    expect(await axe(modal)).toHaveNoViolations();
  });

  it('"Pré-visualizar" opens a tab at once, reads "Gerando rascunho…", asks for the preview job and points the tab at preview.pdf; no status op, no revision', async () => {
    database = await freshDb();
    const PREVIEW_JOB = '019966c1-0000-7000-8000-0000000000e2';
    const FILE = '019966c1-0000-7000-8000-0000000000e3';
    const sync = syncState({ preview: vi.fn(async () => ({ outcome: 'queued' as const, job_id: PREVIEW_JOB })) });
    const tab = { location: { href: '' }, close: vi.fn(), opener: {} };
    const open = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
    render(<Harness sync={sync} />);
    const modal = dialog();
    await userEvent.click(within(modal).getByRole('button', { name: 'Pré-visualizar' }));
    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(within(modal).getByRole('button', { name: 'Gerando rascunho…' })).toBeInTheDocument());
    await waitFor(() => expect(sync.preview).toHaveBeenCalledWith(REL, expect.objectContaining({ file_ids_expected: expect.any(Array) })));
    await act(async () => {
      await applyPulled(database!, [
        serverOp({
          kind: 'create',
          path: `generation_job/${PREVIEW_JOB}`,
          value: { id: PREVIEW_JOB, relatorio_id: REL, kind: 'preview', status: 'queued', error: null, result_file_id: null, result: null, created_at: new Date().toISOString() },
          client_ts: '2026-09-23T12:00:00.000Z',
        }),
        serverOp({ kind: 'put', path: `generation_job/${PREVIEW_JOB}/result_file_id`, value: FILE, client_ts: '2026-09-23T12:00:05.000Z' }),
        serverOp({ kind: 'put', path: `generation_job/${PREVIEW_JOB}/status`, value: 'done', client_ts: '2026-09-23T12:00:05.000Z' }),
      ]);
    });
    await waitFor(() => expect(tab.location.href).toBe(`/api/relatorios/${REL}/preview.pdf?v=${FILE}`));
    await waitFor(() => expect(within(modal).getByRole('button', { name: 'Pré-visualizar' })).toBeInTheDocument());
    expect(sync.generate).not.toHaveBeenCalled();
    expect(await statusOps(database)).toEqual([]);
    // A preview job never reads as a running issue.
    expect(within(modal).queryByText(/Gerando revisão/)).toBeNull();
    open.mockRestore();
  });

  it('a failed preview closes its tab and says so', async () => {
    database = await freshDb();
    const sync = syncState({ preview: vi.fn(async () => Promise.reject(new Error('offline'))) });
    const tab = { location: { href: '' }, close: vi.fn(), opener: {} };
    const open = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
    render(<Harness sync={sync} />);
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Pré-visualizar' }));
    await waitFor(() => expect(within(dialog()).getByText('Não foi possível gerar o rascunho. Os dados não foram alterados.')).toBeVisible());
    expect(tab.close).toHaveBeenCalled();
    open.mockRestore();
  });

  const PREVIEW_JOB = '019966c1-0000-7000-8000-0000000000e2';
  const PREVIEW_FILE = '019966c1-0000-7000-8000-0000000000e3';
  const previewJobCreate = () =>
    serverOp({
      kind: 'create',
      path: `generation_job/${PREVIEW_JOB}`,
      value: { id: PREVIEW_JOB, relatorio_id: REL, kind: 'preview', status: 'queued', error: null, result_file_id: null, result: null, created_at: new Date().toISOString() },
      client_ts: '2026-09-23T12:00:00.000Z',
    });
  const previewSync = (over: SyncStateOverrides = {}) => syncState({ preview: vi.fn(async () => ({ outcome: 'queued' as const, job_id: PREVIEW_JOB })), ...over });
  const fakeTab = () => ({ location: { href: '' }, close: vi.fn(), opener: {} });

  it('a queued preview job alone never reads as a running issue; its done never shows the issue failure', async () => {
    database = await freshDb();
    const sync = previewSync();
    const tab = fakeTab();
    const open = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
    render(<Harness sync={sync} />);
    const modal = dialog();
    await userEvent.click(within(modal).getByRole('button', { name: 'Pré-visualizar' }));
    await waitFor(() => expect(sync.preview).toHaveBeenCalled());
    await act(async () => {
      await applyPulled(database!, [previewJobCreate()]);
    });
    expect(within(modal).queryByText(/Gerando revisão/)).toBeNull();
    expect(within(modal).getByRole('button', { name: 'Gerando rascunho…' })).toBeInTheDocument();
    expect(generateButton()).not.toHaveAttribute('aria-disabled');
    await act(async () => {
      await applyPulled(database!, [
        serverOp({ kind: 'put', path: `generation_job/${PREVIEW_JOB}/result_file_id`, value: PREVIEW_FILE, client_ts: '2026-09-23T12:00:05.000Z' }),
        serverOp({ kind: 'put', path: `generation_job/${PREVIEW_JOB}/status`, value: 'done', client_ts: '2026-09-23T12:00:05.000Z' }),
      ]);
    });
    await waitFor(() => expect(tab.location.href).toBe(`/api/relatorios/${REL}/preview.pdf?v=${PREVIEW_FILE}`));
    expect(modal.querySelector('.gen-error')).toBeNull();
    expect(within(modal).queryByText(/Gerando revisão/)).toBeNull();
    open.mockRestore();
  });

  it('a preview job that ends failed closes the tab and says so', async () => {
    database = await freshDb();
    const sync = previewSync();
    const tab = fakeTab();
    const open = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
    render(<Harness sync={sync} />);
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Pré-visualizar' }));
    await waitFor(() => expect(sync.preview).toHaveBeenCalled());
    await act(async () => {
      await applyPulled(database!, [previewJobCreate(), serverOp({ kind: 'put', path: `generation_job/${PREVIEW_JOB}/status`, value: 'failed', client_ts: '2026-09-23T12:00:05.000Z' })]);
    });
    await waitFor(() => expect(within(dialog()).getByText('Não foi possível gerar o rascunho. Os dados não foram alterados.')).toBeVisible());
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe('');
    open.mockRestore();
  });

  it('answers a first not_caught_up of the preview with a sync and a retry, which succeeds', async () => {
    database = await freshDb();
    const preview = vi
      .fn<NonNullable<SyncState['preview']>>()
      .mockRejectedValueOnce(new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up' }))
      .mockResolvedValue({ outcome: 'queued', job_id: PREVIEW_JOB });
    const sync = syncState({ preview });
    const tab = fakeTab();
    const open = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
    render(<Harness sync={sync} />);
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Pré-visualizar' }));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    // The drain's cycle, then the one that answers the 409.
    expect((sync.syncNow as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
    await act(async () => {
      await applyPulled(database!, [
        previewJobCreate(),
        serverOp({ kind: 'put', path: `generation_job/${PREVIEW_JOB}/result_file_id`, value: PREVIEW_FILE, client_ts: '2026-09-23T12:00:05.000Z' }),
        serverOp({ kind: 'put', path: `generation_job/${PREVIEW_JOB}/status`, value: 'done', client_ts: '2026-09-23T12:00:05.000Z' }),
      ]);
    });
    await waitFor(() => expect(tab.location.href).toBe(`/api/relatorios/${REL}/preview.pdf?v=${PREVIEW_FILE}`));
    expect(within(dialog()).queryByText('Não foi possível gerar o rascunho. Os dados não foram alterados.')).toBeNull();
    open.mockRestore();
  });

  it('offline, "Pré-visualizar" is disabled with the row\'s one offline reason and opens nothing', async () => {
    database = await freshDb();
    const sync = previewSync({ online: false });
    const open = vi.spyOn(window, 'open');
    render(<Harness sync={sync} />);
    const button = within(dialog()).getByRole('button', { name: 'Pré-visualizar' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Gerar relatório precisa de conexão. Conecte e tente de novo.');
    await userEvent.click(button);
    expect(open).not.toHaveBeenCalled();
    expect(sync.preview).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it.each([
    ['DOCX', 'Compartilhar DOCX', 'relatorio-rev-1.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['PDF', 'Compartilhar PDF', 'relatorio-rev-1.pdf', 'application/pdf'],
  ])('E11-Q1: shares the %s file itself, never a URL, where the sheet takes files; saves it where it does not', async (_format, label, name, type) => {
    database = await freshDb();
    const { row, op } = revisionOf(1);
    await applyPulled(database, [...jobOps('done'), op]);
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => {});
    let takesFiles = true;
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => takesFiles, configurable: true, writable: true });
    const saved = recordSaves();
    try {
      const answer: GenerateResponse = { outcome: 'unchanged', revision_id: row.id, revision_number: 1 };
      render(<Harness sync={syncState({ generate: vi.fn(async () => answer) })} />);
      await userEvent.click(generateButton());
      const modal = dialog();
      const button = await waitFor(() => within(modal).getByRole('button', { name: label }));
      expect(button).toHaveClass('icon-btn');
      await userEvent.click(button);
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      const data = share.mock.calls[0]![0];
      expect(data).not.toHaveProperty('url');
      expect(data.title).toBe('Revisão 1 pronta');
      expect(data.files!.map((f) => [f.name, f.type])).toEqual([[name, type]]);
      expect(saved.names).toEqual([]);
      // A sheet that cannot take files: the file is saved instead, and the sheet never opens.
      takesFiles = false;
      await userEvent.click(button);
      await waitFor(() => expect(saved.names).toEqual([name]));
      expect(share).toHaveBeenCalledTimes(1);
    } finally {
      saved.restore();
      delete (navigator as { share?: unknown }).share;
      delete (navigator as { canShare?: unknown }).canShare;
    }
  });

  it("E11-Q1: each revision row's DOCX and PDF save that revision's own file, reading \"Baixando…\" while it comes", async () => {
    database = await freshDb();
    const first = revisionOf(1);
    const second = revisionOf(2);
    await applyPulled(database, [first.op, second.op]);
    render(<Harness sync={syncState()} />);
    const modal = dialog();
    await waitFor(() => expect(modal.querySelectorAll('.revision-row')).toHaveLength(2));
    const saved = recordSaves();
    try {
      for (const { row } of [first, second]) {
        const rowElement = [...modal.querySelectorAll<HTMLElement>('.revision-row')].find((el) => el.querySelector('.rev-text')?.textContent?.startsWith(`Rev. ${row.number} `));
        expect(rowElement).toBeDefined();
        const held = saved.hold();
        await userEvent.click(within(rowElement!).getByRole('button', { name: 'PDF' }));
        await waitFor(() => expect(within(rowElement!).getByRole('button', { name: 'Baixando…' })).toBeInTheDocument());
        held.release();
        await waitFor(() => expect(within(rowElement!).getByRole('button', { name: 'PDF' })).toBeInTheDocument());
        expect(saved.fetch).toHaveBeenLastCalledWith(`/api/revisions/${row.id}/pdf`, expect.anything());
        await userEvent.click(within(rowElement!).getByRole('button', { name: 'DOCX' }));
        await waitFor(() => expect(saved.fetch).toHaveBeenLastCalledWith(`/api/revisions/${row.id}/docx`, expect.anything()));
      }
      await waitFor(() => expect(saved.names).toEqual(['relatorio-rev-1.pdf', 'relatorio-rev-1.docx', 'relatorio-rev-2.pdf', 'relatorio-rev-2.docx']));
    } finally {
      saved.restore();
    }
  });

  it('E11-Q1: a failed fetch words the failure beside the row and saves nothing; the next press clears it', async () => {
    database = await freshDb();
    const first = revisionOf(1);
    await applyPulled(database, [first.op]);
    render(<Harness sync={syncState()} />);
    const modal = dialog();
    await waitFor(() => expect(modal.querySelectorAll('.revision-row')).toHaveLength(1));
    const saved = recordSaves();
    try {
      saved.fetch.mockImplementation(async () => new Response('', { status: 401 }));
      await userEvent.click(within(modal).getByRole('button', { name: 'PDF' }));
      await waitFor(() => expect(within(modal).getByRole('alert')).toHaveTextContent('Não foi possível baixar o arquivo. Verifique a conexão e tente de novo.'));
      expect(saved.names).toEqual([]);
      saved.fetch.mockImplementation(async () => new Response('%PDF', { status: 200 }));
      await userEvent.click(within(modal).getByRole('button', { name: 'PDF' }));
      await waitFor(() => expect(saved.names).toEqual(['relatorio-rev-1.pdf']));
      expect(within(modal).queryByRole('alert')).toBeNull();
    } finally {
      saved.restore();
    }
  });

  it('lists the other devices\' last send, never this device\'s own', async () => {
    database = await freshDb();
    const OTHER = '019966c1-0000-7000-8000-0000000000aa';
    const sync = syncState({
      deviceId: 'tablet-1',
      userNames: { [USER]: 'Bento Braga', [OTHER]: 'Eduardo' },
      lastPushAt: [
        { user_id: USER, device_id: 'tablet-1', at: '2026-09-06T21:10:00.000Z' },
        { user_id: OTHER, device_id: 'tablet-2', at: '2026-09-06T21:10:00.000Z' },
      ],
    });
    render(<Harness sync={sync} />);
    const list = await waitFor(() => {
      const found = dialog().querySelector('ul.precheck');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(within(list).getByText(/^Último envio de Eduardo: \d{2}\/\d{2} \d{2}:\d{2}$/)).toBeVisible();
    expect(within(list).queryByText(/Último envio de Bento/)).toBeNull();
  });
});
