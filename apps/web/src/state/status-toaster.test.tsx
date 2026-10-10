import 'fake-indexeddb/auto';
import { putRelatorioStatusOp, SERVER_DEVICE_ID, type Op, type OpDraft, type RelatorioStatus, type RevisionRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBatch, undoBatch } from '../db/commit.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { applyPulled } from '../db/sync-store.ts';
import { newId } from '../ids.ts';
import type { SessionState } from './session.tsx';
import { openRelatorioId, StatusToaster } from './status-toaster.tsx';
import { ToastOutlet, ToastProvider, useToast } from './toast.tsx';

/*
 * Status flow 2026-10-10 (M3): every status change this device commits is said by the
 * shell, with the kernel's sentence, and never at the cost of a live undo toast.
 */

const REL = portoSeguroSmall.relatorioId;
const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const AUTHOR = { id: USER, companyId: COMPANY };
const BLOCK = portoSeguroSmall.log.find((op) => op.kind === 'create' && op.path.startsWith('block/'))!.path.split('/')[1]!;

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

async function dbAt(status: RelatorioStatus): Promise<AppDatabase> {
  const user = `019966c1-0052-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  await applyPulled(fresh, portoSeguroSmall.log);
  const record = await fresh.entities.get(['relatorio', REL]);
  await fresh.entities.put({ ...record!, row: { ...(record!.row as object), status } as never });
  return fresh;
}

function revisionOp(number: number): Op {
  const row: RevisionRow = { id: newId(), relatorio_id: REL, number, snapshot_seq: 90_000, created_by: USER, docx_file_id: newId(), pdf_file_id: newId(), created_at: '2026-09-23T12:00:30.000Z' };
  return {
    op_id: newId(),
    kind: 'create',
    scope: 'relatorio',
    company_id: COMPANY,
    project_id: null,
    relatorio_id: REL,
    path: `revision/${row.id}`,
    value: row as unknown as Op['value'],
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: 'system:generate',
    device_id: SERVER_DEVICE_ID,
    client_ts: row.created_at,
    seq: 90_001,
  };
}

const sheetEdit = (): OpDraft => ({
  kind: 'put',
  scope: 'relatorio',
  company_id: COMPANY,
  project_id: null,
  relatorio_id: REL,
  path: `sheet/${BLOCK}/observations`,
  value: 'Visto em campo',
  prev_op_id: null,
  batch_id: null,
  meta: null,
  actor_id: USER,
});

const deps = { newId, now: () => new Date() };

function UndoButton() {
  const { showToast, withdrawToast, dismissToast } = useToast();
  return (
    <>
      <button type="button" onClick={dismissToast}>
        dispensar
      </button>
      <button type="button" onClick={() => showToast('Ficha removida', { action: { label: 'Desfazer', onPress: () => undefined } })}>
        remover
      </button>
      <button type="button" onClick={() => withdrawToast('Ficha removida')}>
        retirar
      </button>
    </>
  );
}

function Shell({ at = `/relatorio/${REL}/ficha/${BLOCK}` }: { at?: string }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <ToastProvider>
        <StatusToaster />
        <UndoButton />
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>
  );
}

const toastText = () => screen.queryByTestId('toast')?.textContent ?? '';

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

describe('StatusToaster', () => {
  it('field work in Rascunho says "Relatório em campo"', async () => {
    database = await dbAt('rascunho');
    render(<Shell />);
    await act(async () => {
      await commitBatch(database!, [sheetEdit()], deps);
    });
    await waitFor(() => expect(toastText()).toContain('Relatório em campo'));
    // An edit's status toast is passive (no scroll, no press taken).
    expect(screen.getByTestId('toast')).toHaveAttribute('data-passive');
  });

  it('P10: only the relatório whose route is open is spoken of: a change of another one stays silent', async () => {
    expect(openRelatorioId(`/relatorio/${REL}`)).toBe(REL);
    expect(openRelatorioId(`/relatorio/${REL}/fotos`)).toBe(REL);
    expect(openRelatorioId('/')).toBeNull();
    expect(openRelatorioId('/project/abc')).toBeNull();
    database = await dbAt('rascunho');
    render(<Shell at="/relatorio/019966c1-0052-7000-8000-0000000000ff" />);
    await act(async () => {
      await commitBatch(database!, [sheetEdit()], deps);
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('P10: a revisions read that fails silences neither that change nor the next one', async () => {
    database = await dbAt('rascunho');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const entities = vi.spyOn(database.entities, 'where').mockImplementationOnce(() => {
      throw new Error('read failed');
    });
    try {
      render(<Shell />);
      await act(async () => {
        await commitBatch(database!, [putRelatorioStatusOp(AUTHOR, REL, 'em_campo')], deps);
      });
      await act(async () => {
        await commitBatch(database!, [putRelatorioStatusOp(AUTHOR, REL, 'rascunho')], deps);
      });
      await waitFor(() => expect(toastText()).toContain('Relatório voltou para Rascunho'));
      // A status toast that answers the user's own press is not passive.
      expect(screen.getByTestId('toast')).not.toHaveAttribute('data-passive');
    } finally {
      entities.mockRestore();
      error.mockRestore();
    }
  });

  it('an edit in Em campo says nothing', async () => {
    database = await dbAt('em_campo');
    render(<Shell />);
    await act(async () => {
      await commitBatch(database!, [sheetEdit()], deps);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('an edit after Emitido says it reopened and names the next revision; its undo says where it went back to', async () => {
    database = await dbAt('emitido');
    await applyPulled(database, [revisionOp(1)]);
    render(<Shell />);
    let batchId = '';
    await act(async () => {
      batchId = (await commitBatch(database!, [sheetEdit()], deps)).batch_id;
    });
    await waitFor(() => expect(toastText()).toContain('Relatório reaberto em revisão. A próxima emissão gera a revisão 2.'));
    await act(async () => {
      await undoBatch(database!, batchId, deps);
    });
    // The newer status of the relatório takes the older sentence away.
    await waitFor(() => expect(toastText()).toContain('Relatório voltou para Emitido'));
  });

  it('"Marcar como enviado ao cliente" (the issue op) names the revision; a backward move names the status', async () => {
    database = await dbAt('em_revisao');
    await applyPulled(database, [revisionOp(3)]);
    render(<Shell />);
    await act(async () => {
      await commitBatch(database!, [putRelatorioStatusOp(AUTHOR, REL, 'emitido')], deps);
    });
    await waitFor(() => expect(toastText()).toContain('Revisão 3 marcada como enviada ao cliente. Relatório emitido.'));
    await act(async () => {
      await commitBatch(database!, [putRelatorioStatusOp(AUTHOR, REL, 'em_revisao')], deps);
    });
    await waitFor(() => expect(toastText()).toContain('Relatório voltou para Em revisão'));
  });

  it('an undo that puts Rascunho back takes the waiting "Relatório em campo" away: only the newest status is said', async () => {
    database = await dbAt('rascunho');
    render(<Shell />);
    await userEvent.click(screen.getByText('remover'));
    let batchId = '';
    await act(async () => {
      batchId = (await commitBatch(database!, [sheetEdit()], deps)).batch_id;
    });
    await act(async () => {
      await undoBatch(database!, batchId, deps);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(toastText()).toContain('Ficha removida');
    await userEvent.click(screen.getByText('retirar'));
    await waitFor(() => expect(toastText()).toContain('Relatório voltou para Rascunho'));
    await userEvent.click(screen.getByText('dispensar'));
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('an undo toast on screen is not lost: the status toast waits behind it', async () => {
    database = await dbAt('rascunho');
    render(<Shell />);
    await userEvent.click(screen.getByText('remover'));
    await act(async () => {
      await commitBatch(database!, [sheetEdit()], deps);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
    expect(toastText()).toContain('Ficha removida');
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeInTheDocument();
    await userEvent.click(screen.getByText('retirar'));
    await waitFor(() => expect(toastText()).toContain('Relatório em campo'));
  });
});
