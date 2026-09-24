import 'fake-indexeddb/auto';
import { SERVER_DEVICE_ID, type GenerateResponse, type Op, type RevisionRow } from '@app/domain';
import { BLOCK_CHAVE_ID, portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { act, cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBatch } from '../../db/commit.ts';
import { readGenerateAwaiting } from '../../db/prefs.ts';
import { openDatabase, type AppDatabase, type OutboxRow } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import { newId } from '../../ids.ts';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
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
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
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
  return fresh;
}

type Overrides = Partial<Omit<SyncState, 'counts'>> & { counts?: Partial<SyncState['counts']> };

function syncState(over: Overrides = {}): SyncState {
  const counts = { pending: 0, sent: 0, dead: 0, sheets_pending: 0, photos_pending: 0, ...over.counts };
  return {
    badgeState: 'ok',
    pendingText: '',
    pendingCount: 0,
    online: true,
    running: false,
    outdated: false,
    lastResult: 'ran',
    lastFailure: null,
    unreachable: null,
    lastSyncAt: null,
    lastPushAt: [],
    supersededCount: 0,
    deviceId: 'tablet-1',
    userNames: { [USER]: 'Bento Braga' },
    summaryRelatorios: [],
    syncNow: vi.fn(async () => 'ran' as const),
    syncRelatorio: vi.fn(async () => 'ran' as const),
    resendDead: vi.fn(async () => {}),
    fetchFile: vi.fn(async () => new Blob()),
    generate: vi.fn(async () => ({ outcome: 'queued' as const, job_id: JOB_ID, revision_number: 1 })),
    ...over,
    counts,
  };
}

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

const jobOps = (status: 'queued' | 'running' | 'done' | 'failed', jobId = JOB_ID): Op[] => [
  serverOp({
    kind: 'create',
    path: `generation_job/${jobId}`,
    // Created "now": a job older than the queue expiry no longer counts as running (`isJobActive`).
    value: { id: jobId, relatorio_id: REL, kind: 'issue', status: 'queued', error: null, result_file_id: null, result: null, created_at: new Date().toISOString() },
    client_ts: '2026-09-23T12:00:00.000Z',
  }),
  ...(status === 'queued' ? [] : [serverOp({ kind: 'put', path: `generation_job/${jobId}/status`, value: status, client_ts: '2026-09-23T12:00:01.000Z' })]),
];

function revisionOf(number: number): { row: RevisionRow; op: Op } {
  const row: RevisionRow = {
    id: newId(),
    relatorio_id: REL,
    number,
    snapshot_seq: 100 * number,
    created_by: USER,
    docx_file_id: newId(),
    pdf_file_id: newId(),
    created_at: '2026-09-23T12:00:30.000Z',
  };
  return { row, op: serverOp({ kind: 'create', path: `revision/${row.id}`, value: row, client_ts: row.created_at }) };
}

const dialog = () => screen.getByRole('dialog');
const generateButton = () => within(dialog()).getByRole('button', { name: 'Gerar relatório' });
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
    expect(screen.getByTestId('toast')).toHaveTextContent('Revisão 1 pronta — DOCX');
    expect(modal.querySelector('.t-meta time')).toHaveAttribute('datetime', row.created_at);
    expect(modal.querySelector('p.t-meta')).toHaveTextContent('23/09/2026 09:00 · Bento Braga');
    expect(within(modal).getByRole('button', { name: 'DOCX — abrir no Word' })).toHaveClass('rr-open');
    expect(within(modal).getByText('Qualquer alteração a partir de agora gera a revisão 2.')).toBeInTheDocument();
    // Em revisão --issue--> Emitido, the device's second op; the pill follows the row.
    await waitFor(async () => expect(await statusOps(database!)).toEqual(['em_revisao', 'emitido']));
    await waitFor(() => expect(modal.querySelector('.row-wrap .status-pill')).toHaveTextContent('Emitido'));

    // The Revisões list: "Rev. 1 — dd/mm/aaaa hh:mm — Bento Braga" with a DOCX button.
    const rowElement = modal.querySelector('.revision-row')!;
    expect(rowElement.querySelector('.rev-text')).toHaveTextContent('Rev. 1 — 23/09/2026 09:00 — Bento Braga');
    expect(rowElement.querySelector('.rev-text time')).toHaveAttribute('datetime', row.created_at);
    expect(within(rowElement as HTMLElement).getByRole('button', { name: 'DOCX' })).toHaveClass('btn-text');

    // Both open the download in a new tab.
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await userEvent.click(within(modal).getByRole('button', { name: 'DOCX — abrir no Word' }));
    expect(open).toHaveBeenCalledWith(`/api/revisions/${row.id}/docx`, '_blank', 'noopener');
    open.mockRestore();

    expect(await axe(modal)).toHaveNoViolations();

    // "Gerar de novo" goes back to idle, with the next number in the reason.
    await userEvent.click(within(modal).getByRole('button', { name: 'Gerar de novo' }));
    expect(within(modal).getByText('Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 2. Precisa de conexão.')).toBeInTheDocument();
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
    expect(await statusOps(database!)).toEqual(['em_revisao']);

    // "Tentar novamente" asks again; a request that never completes fails inline too.
    (sync.generate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new SyncRequestError({ kind: 'network' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(sync.generate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(modal).getByRole('alert')).toBeInTheDocument());
  });

  it('answers "unchanged" with the existing revision, no op and no toast', async () => {
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
    expect(await statusOps(database!)).toEqual([]);
    expect(modal.querySelectorAll('.revision-row')).toHaveLength(1);
  });

  it('sends the device\'s newest op and the files it expects: a committed setup put and a pulled photo row', async () => {
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
    expect(sync.generate).toHaveBeenCalledWith(REL, { last_op_id: put.ops[0]!.op_id, file_ids_expected: [photoId] });
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
    expect(screen.getByTestId('toast')).toHaveTextContent('Revisão 1 pronta — DOCX');
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
    await waitFor(() => expect(sync.syncRelatorio).toHaveBeenCalled());

    await act(async () => {
      await applyPulled(database!, [...jobOps('done'), op]);
    });
    await waitFor(() => expect(within(modal).getByRole('button', { name: 'DOCX — abrir no Word' })).not.toHaveAttribute('aria-disabled'));
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
