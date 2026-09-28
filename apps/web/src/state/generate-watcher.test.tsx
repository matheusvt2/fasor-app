import 'fake-indexeddb/auto';
import { SERVER_DEVICE_ID, type Op, type RevisionRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGenerateAwaiting, writeGenerateAwaiting } from '../db/prefs.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { applyPulled } from '../db/sync-store.ts';
import { newId } from '../ids.ts';
import { makeSyncState } from '../test/sync-state.ts';
import { finishGenerate, GenerateWatcher } from './generate-watcher.tsx';
import type { SessionState } from './session.tsx';
import { SyncContext } from './sync.tsx';
import { ToastOutlet, ToastProvider } from './toast.tsx';

/*
 * R4 (Story 7.5): the app-level watcher turns an awaited revision into the `issue` op and
 * the ready toast wherever the user is, once; a failed job clears the wait silently; the
 * Export dialog's finish goes through the same function, so a second finish of the same
 * revision writes and says nothing.
 */

const REL = portoSeguroSmall.relatorioId;
const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const JOB = '019966c1-0000-7000-8000-0000000000f1';

let database: AppDatabase | null = null;
let counter = 0;

vi.mock('./session.tsx', () => ({
  useSession: (): Partial<SessionState> => ({
    status: 'signed-in',
    user: { id: USER, name: 'Bento', email: 'b@t', companyId: COMPANY, companyName: 'B', council: null, registrationNumber: null, title: null },
    online: true,
    database,
  }),
}));

async function freshDb(): Promise<AppDatabase> {
  const user = `019966c1-0051-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  await applyPulled(fresh, portoSeguroSmall.log);
  // The press moved it to Em revisão already (the `generate` op), as the dialog does.
  const record = await fresh.entities.get(['relatorio', REL]);
  await fresh.entities.put({ ...record!, row: { ...(record!.row as object), status: 'em_revisao' } as never });
  return fresh;
}

let seq = 30_000;
function serverOp(kind: Op['kind'], path: string, value: unknown): Op {
  return {
    op_id: newId(),
    kind,
    scope: 'relatorio',
    company_id: COMPANY,
    project_id: null,
    relatorio_id: REL,
    path,
    value: value as Op['value'],
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: 'system:generate',
    device_id: SERVER_DEVICE_ID,
    client_ts: '2026-09-23T12:00:00.000Z',
    seq: ++seq,
  };
}

function job(status: 'queued' | 'done' | 'failed'): Op[] {
  return [
    serverOp('create', `generation_job/${JOB}`, { id: JOB, relatorio_id: REL, kind: 'issue', status: 'queued', error: null, result_file_id: null, result: null, created_at: new Date().toISOString() }),
    ...(status === 'queued' ? [] : [serverOp('put', `generation_job/${JOB}/status`, status)]),
  ];
}

function revision(number: number): { row: RevisionRow; op: Op } {
  const row: RevisionRow = { id: newId(), relatorio_id: REL, number, snapshot_seq: seq + 10, created_by: USER, docx_file_id: newId(), pdf_file_id: newId(), created_at: '2026-09-23T12:00:30.000Z' };
  return { row, op: serverOp('create', `revision/${row.id}`, row) };
}

const issueOps = async (db: AppDatabase) => (await db.outbox.where('path').equals('relatorio/status').toArray()).map((row) => row.value);

function Watching({ sync = makeSyncState() }: { sync?: ReturnType<typeof makeSyncState> }) {
  return (
    <SyncContext value={sync}>
      <ToastProvider>
        <GenerateWatcher pollMs={20} />
        <ToastOutlet />
      </ToastProvider>
    </SyncContext>
  );
}

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

describe('R4 GenerateWatcher', () => {
  it('off the Sumário: the awaited revision arrives, the issue op is written and the toast raised, once', async () => {
    database = await freshDb();
    await writeGenerateAwaiting(database, REL, { number: 1, job_id: JOB });
    render(<Watching />);
    const { op } = revision(1);
    await act(async () => {
      await applyPulled(database!, [...job('done'), op]);
    });
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Revisão 1 pronta — DOCX'));
    await waitFor(async () => expect(await issueOps(database!)).toEqual(['emitido']));
    await waitFor(async () => expect(await readGenerateAwaiting(database!, REL)).toBeNull());
    // A later pull re-renders the watcher: nothing is written twice.
    await act(async () => {
      await applyPulled(database!, [serverOp('put', `generation_job/${JOB}/error`, null)]);
    });
    expect(await issueOps(database!)).toEqual(['emitido']);
  });

  it('pulls an awaited relatório\'s stream while online', async () => {
    database = await freshDb();
    await writeGenerateAwaiting(database, REL, { number: 1, job_id: JOB });
    const sync = makeSyncState();
    render(<Watching sync={sync} />);
    await waitFor(() => expect(sync.syncRelatorio).toHaveBeenCalledWith(REL));
  });

  it('does not pull while offline', async () => {
    database = await freshDb();
    await writeGenerateAwaiting(database, REL, { number: 1, job_id: JOB });
    const sync = makeSyncState({ online: false });
    render(<Watching sync={sync} />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sync.syncRelatorio).not.toHaveBeenCalled();
  });

  it('a failed job clears the wait silently: no op, no toast', async () => {
    database = await freshDb();
    await writeGenerateAwaiting(database, REL, { number: 1, job_id: JOB });
    render(<Watching />);
    await act(async () => {
      await applyPulled(database!, job('failed'));
    });
    await waitFor(async () => expect(await readGenerateAwaiting(database!, REL)).toBeNull());
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(await issueOps(database!)).toEqual([]);
  });

  it('finishGenerate is once per revision: the dialog and the watcher never both write or toast', async () => {
    database = await freshDb();
    const { row, op } = revision(1);
    await applyPulled(database, [op]);
    const toasts: string[] = [];
    const author = { id: USER, companyId: COMPANY };
    const db = database;
    // Each caller reads the outbox the moment it resolves: the losing one waits for the
    // winner's `issue` op, so neither goes ready on the pre-issue status.
    const finish = () => finishGenerate(db, author, REL, row, (text) => toasts.push(text)).then(async (won) => ({ won, ops: await issueOps(db) }));
    const [first, second] = await Promise.all([finish(), finish()]);
    expect([first.won, second.won].sort()).toEqual([false, true]);
    expect(first.ops).toEqual(['emitido']);
    expect(second.ops).toEqual(['emitido']);
    expect(toasts).toEqual(['Revisão 1 pronta — DOCX']);
    expect(await issueOps(database)).toEqual(['emitido']);
  });
});
