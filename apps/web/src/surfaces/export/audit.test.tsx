import 'fake-indexeddb/auto';
import { SERVER_DEVICE_ID, type AuditFinding, type Op } from '@app/domain';
import { BLOCK_CHAVE_ID, portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import { newId } from '../../ids.ts';
import { AiFeaturesContext } from '../../state/ai-features.tsx';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState, type SyncStateOverrides } from '../../test/sync-state.ts';
import { SyncRequestError } from '../../sync/client.ts';
import { ExportDialog } from './export-dialog.tsx';

/*
 * Story 13.8 (AI-3): the emission audit in the Export dialog, over a real device database
 * (the small Porto Seguro fixture pulled into Dexie) and a stubbed sync context. The button
 * and the block are absent with AI features off; a tap asks once behind the barrier; a run
 * that is still running disables the button and never "Gerar relatório"; a finished run's
 * findings are rows with "Ver" whose targets are the kernel's; a failed run says so.
 */

configure({ asyncUtilTimeout: 5000 });

const REL = portoSeguroSmall.relatorioId;
const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RUN = '019966c1-0000-7000-8000-0000000000a1';
const TIMING = { pollMs: 20, retryMs: 10 };

let database: AppDatabase | null = null;
let counter = 0;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: USER, name: 'Bento Braga', email: 'b@teste.local', companyId: COMPANY, companyName: 'Empresa B de Teste', council: null, registrationNumber: null, title: null },
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

let seq = 30_000;
function serverOp(kind: Op['kind'], path: string, value: unknown, actor = 'system:audit'): Op {
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
    actor_id: actor,
    device_id: SERVER_DEVICE_ID,
    client_ts: new Date().toISOString(),
    seq: ++seq,
  };
}

const parecer = (): Op => ({ ...serverOp('put', 'relatorio/setup/parecer', { verdict: 'apto', text: null, text_status: null, text_basis: null }, USER), device_id: 'tablet-other' });

async function freshDb(): Promise<AppDatabase> {
  const user = `019966c1-0049-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  await applyPulled(fresh, portoSeguroSmall.log);
  await applyPulled(fresh, [parecer()]);
  return fresh;
}

const FINDINGS: AuditFinding[] = [
  { kind: 'conclusion_vs_nc', text: 'A conclusão aprova com um item NC.', ref: `sheet:${BLOCK_CHAVE_ID}`, label: 'Chave seccionadora SEC-TEST', target: { kind: 'sheet', blockId: BLOCK_CHAVE_ID } },
  { kind: 'parecer_vs_restricoes', text: 'O parecer não cita as restrições.', ref: 'section:10', label: 'Seção 10 · Conclusão e parecer', target: { kind: 'section', rowKey: 'section_10' } },
];

/** A run of the relatório as the server writes it: its create, then the puts of `status`. */
function runOps(status: 'queued' | 'running' | 'done' | 'failed', options: { id?: string; findings?: AuditFinding[]; createdAt?: string } = {}): Op[] {
  const id = options.id ?? RUN;
  const createdAt = options.createdAt ?? new Date().toISOString();
  const ops = [
    serverOp('create', `audit_run/${id}`, { id, relatorio_id: REL, status: 'queued', findings: [], error: null, prompt_version: null, created_at: createdAt, started_at: null, finished_at: null }),
  ];
  if (status === 'running') ops.push(serverOp('put', `audit_run/${id}/status`, 'running'), serverOp('put', `audit_run/${id}/started_at`, new Date().toISOString()));
  if (status === 'done') {
    ops.push(
      serverOp('put', `audit_run/${id}/findings`, options.findings ?? FINDINGS),
      serverOp('put', `audit_run/${id}/prompt_version`, 'fake-audit-1'),
      serverOp('put', `audit_run/${id}/finished_at`, '2026-10-07T17:32:00.000Z'),
      serverOp('put', `audit_run/${id}/status`, 'done'),
    );
  }
  if (status === 'failed') ops.push(serverOp('put', `audit_run/${id}/error`, 'provider_failed'), serverOp('put', `audit_run/${id}/status`, 'failed'));
  return ops;
}

function Harness({ sync, ai = true, onSee }: { sync: SyncState; ai?: boolean; onSee?: (target: unknown) => void }) {
  return (
    <AiFeaturesContext value={ai}>
      <MemoryRouter>
        <SyncContext value={sync}>
          <ToastProvider>
            <ExportDialog relatorioId={REL} isOpen onOpenChange={() => {}} timing={TIMING} {...(onSee === undefined ? {} : { onSeeAuditTarget: onSee })} />
          </ToastProvider>
        </SyncContext>
      </MemoryRouter>
    </AiFeaturesContext>
  );
}

const syncState = (over: SyncStateOverrides = {}): SyncState => makeSyncState({ userNames: { [USER]: 'Bento Braga' }, ...over });
const dialog = () => screen.getByRole('dialog');
const auditButton = () => within(dialog()).getByRole('button', { name: /^(Conferir antes de emitir|Conferindo…)$/ });
const generateButton = () => within(dialog()).getByRole('button', { name: /^(Gerar relatório|Gerando…)$/ });

afterEach(async () => {
  cleanup();
  await database?.delete();
  database = null;
});

describe('13.8 the audit in the Export dialog', () => {
  it('renders no button and no findings with AI features off, even with a finished run on the device', async () => {
    database = await freshDb();
    await applyPulled(database, runOps('done'));
    render(<Harness sync={syncState()} ai={false} />);
    await waitFor(() => expect(generateButton()).toBeInTheDocument());
    await within(dialog()).findByText('Antes de emitir');
    expect(within(dialog()).queryByRole('button', { name: 'Conferir antes de emitir' })).toBeNull();
    expect(within(dialog()).queryByText('Conferência por IA')).toBeNull();
    expect(within(dialog()).queryByText(FINDINGS[0]!.text)).toBeNull();
  });

  it('renders the button with the AI note when AI features are on, and no findings before a run', async () => {
    database = await freshDb();
    render(<Harness sync={syncState()} />);
    expect(await within(dialog()).findByRole('button', { name: 'Conferir antes de emitir' })).not.toHaveAttribute('aria-disabled');
    expect(within(dialog()).getByText('Conferência por IA')).toBeInTheDocument();
    expect(within(dialog()).getByText('Feita por IA: aponta pontos para você conferir. Nada é alterado no relatório.')).toBeInTheDocument();
    expect(within(dialog()).queryByRole('list', { name: 'Pontos apontados pela conferência por IA' })).toBeNull();
  });

  it('a tap drains, asks once behind the barrier and waits; the finished run\'s findings then render', async () => {
    database = await freshDb();
    const db = database;
    const audit = vi.fn(async () => {
      // The server's run arrives with the next pull.
      await applyPulled(db, runOps('running'));
      return { audit_run_id: RUN };
    });
    const syncRelatorio = vi.fn(async () => {
      const done = await db.entities.get(['audit_run', RUN]);
      if (done !== undefined && audit.mock.calls.length > 0) await applyPulled(db, runOps('done').slice(1));
      return 'ran' as const;
    });
    render(<Harness sync={syncState({ audit, syncRelatorio })} />);
    await userEvent.click(await within(dialog()).findByRole('button', { name: 'Conferir antes de emitir' }));
    await waitFor(() => expect(audit).toHaveBeenCalledTimes(1));
    expect(audit).toHaveBeenCalledWith(REL, { last_op_id: null, file_ids_expected: expect.any(Array) });
    const list = await within(dialog()).findByRole('list', { name: 'Pontos apontados pela conferência por IA' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(dialog()).getByText('2 pontos para conferir')).toBeInTheDocument();
    expect(within(dialog()).getByText('Conferido às 14:32')).toBeInTheDocument();
    await waitFor(() => expect(auditButton()).toHaveTextContent('Conferir antes de emitir'));
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it('a running run disables the button with its reason, and never "Gerar relatório"', async () => {
    database = await freshDb();
    await applyPulled(database, runOps('running'));
    render(<Harness sync={syncState()} />);
    await waitFor(() => expect(auditButton()).toHaveTextContent('Conferindo…'));
    expect(auditButton()).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog()).getByText('A conferência está em andamento; os pontos aparecem aqui.')).toBeInTheDocument();
    expect(generateButton()).not.toHaveAttribute('aria-disabled');
  });

  it('lists a finished run as rows naming their target, each "Ver" handing its kernel target over', async () => {
    database = await freshDb();
    await applyPulled(database, runOps('done'));
    const onSee = vi.fn();
    render(<Harness sync={syncState()} onSee={onSee} />);
    const list = await within(dialog()).findByRole('list', { name: 'Pontos apontados pela conferência por IA' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('A conclusão aprova com um item NC. — Conclusão e itens NC · Chave seccionadora SEC-TEST');
    expect(rows[1]).toHaveTextContent('O parecer não cita as restrições. — Parecer e restrições · Seção 10 · Conclusão e parecer');
    await userEvent.click(within(rows[0]!).getByRole('button', { name: 'Ver Chave seccionadora SEC-TEST' }));
    expect(onSee).toHaveBeenLastCalledWith({ kind: 'sheet', blockId: BLOCK_CHAVE_ID });
    await userEvent.click(within(rows[1]!).getByRole('button', { name: 'Ver Seção 10 · Conclusão e parecer' }));
    expect(onSee).toHaveBeenLastCalledWith({ kind: 'section', rowKey: 'section_10' });
    // Information only: "Gerar relatório" is untouched by the findings.
    expect(generateButton()).not.toHaveAttribute('aria-disabled');
  });

  it('says "Nenhum ponto encontrado" for a finished run with no finding', async () => {
    database = await freshDb();
    await applyPulled(database, runOps('done', { findings: [] }));
    render(<Harness sync={syncState()} />);
    expect(await within(dialog()).findByText('Nenhum ponto encontrado')).toBeInTheDocument();
  });

  it('a failed run says it could not check and leaves the button tappable; a stale running run reads as failed', async () => {
    database = await freshDb();
    await applyPulled(database, runOps('failed'));
    render(<Harness sync={syncState()} />);
    expect(await within(dialog()).findByText('Não foi possível conferir agora.')).toBeInTheDocument();
    expect(auditButton()).not.toHaveAttribute('aria-disabled');
    cleanup();
    await database.delete();

    database = await freshDb();
    await applyPulled(database, runOps('queued', { id: '019966c1-0000-7000-8000-0000000000a2', createdAt: '2026-01-01T00:00:00.000Z' }));
    render(<Harness sync={syncState()} />);
    expect(await within(dialog()).findByText('Não foi possível conferir agora.')).toBeInTheDocument();
    expect(auditButton()).toHaveTextContent('Conferir antes de emitir');
  });

  it('a 409 audit_running waits on the run the server names: one request, its findings render, no failure line', async () => {
    database = await freshDb();
    const db = database;
    const audit = vi.fn(async () => {
      throw new SyncRequestError({ kind: 'http', status: 409, code: 'audit_running', details: { audit_run_id: RUN } });
    });
    let pulls = 0;
    const syncRelatorio = vi.fn(async () => {
      // The other run arrives with the first pull, finished with the second.
      pulls += 1;
      if (pulls === 1) await applyPulled(db, runOps('running'));
      else if (pulls === 2) await applyPulled(db, runOps('done').slice(1));
      return 'ran' as const;
    });
    render(<Harness sync={syncState({ audit, syncRelatorio })} />);
    await userEvent.click(await within(dialog()).findByRole('button', { name: 'Conferir antes de emitir' }));
    const list = await within(dialog()).findByRole('list', { name: 'Pontos apontados pela conferência por IA' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    await waitFor(() => expect(auditButton()).toHaveTextContent('Conferir antes de emitir'));
    expect(audit).toHaveBeenCalledTimes(1);
    expect(within(dialog()).queryByText('Não foi possível conferir agora.')).toBeNull();
  });

  it('a 409 not_caught_up is answered with a sync and a second request', async () => {
    database = await freshDb();
    const db = database;
    const order: string[] = [];
    let calls = 0;
    const audit = vi.fn(async () => {
      calls += 1;
      order.push('audit');
      if (calls === 1) throw new SyncRequestError({ kind: 'http', status: 409, code: 'not_caught_up', details: { missing_op: true, missing_files: [] } });
      await applyPulled(db, runOps('done'));
      return { audit_run_id: RUN };
    });
    const syncNow = vi.fn(async () => {
      order.push('sync');
      return 'ran' as const;
    });
    render(<Harness sync={syncState({ audit, syncNow })} />);
    await userEvent.click(await within(dialog()).findByRole('button', { name: 'Conferir antes de emitir' }));
    await within(dialog()).findByRole('list', { name: 'Pontos apontados pela conferência por IA' });
    expect(audit).toHaveBeenCalledTimes(2);
    const first = order.indexOf('audit');
    expect(order.slice(first + 1, order.lastIndexOf('audit'))).toContain('sync');
    expect(within(dialog()).queryByText('Não foi possível conferir agora.')).toBeNull();
  });

  it('a refused request says it could not check', async () => {
    database = await freshDb();
    const audit = vi.fn(async () => {
      throw new SyncRequestError({ kind: 'http', status: 409, code: 'ai_features_off' });
    });
    render(<Harness sync={syncState({ audit })} />);
    await userEvent.click(await within(dialog()).findByRole('button', { name: 'Conferir antes de emitir' }));
    expect(await within(dialog()).findByText('Não foi possível conferir agora.')).toBeInTheDocument();
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it('offline, the button waits with its reason', async () => {
    database = await freshDb();
    render(<Harness sync={syncState({ online: false })} />);
    await waitFor(() => expect(auditButton()).toHaveAttribute('aria-disabled', 'true'));
    expect(within(dialog()).getByText('Sem conexão: a conferência precisa do servidor.')).toBeInTheDocument();
  });
});
