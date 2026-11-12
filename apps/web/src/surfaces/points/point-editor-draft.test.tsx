import 'fake-indexeddb/auto';
import { buildSnapshot, replay, type RelatorioSnapshot } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { act, cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from 'react-aria-components';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import { DraftProvider } from '../../state/drafts.tsx';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { CreatePointAction } from './create-point-action.tsx';
import type { PointSeed } from './point-editor.tsx';
import { POINT_DRAFT_SURFACE } from './point-writes.ts';

/*
 * G1 (coordinator item of 2026-11-11, the Epic 24 final hands-on pass): a new point from a test or an NC item with a
 * Prazo typed by hand, stored by "Concluir", leaves no draft of itself, so no "Rascunho encontrado" comes back on the
 * next load. A refused write keeps its draft; a priority tap with no typed Prazo leaves none.
 */

configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RELATORIO = portoSeguroSmall.relatorioId;
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
  settled: true,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

// A refused deadline write (a closed database, a quota) for the control below.
const refuse = vi.hoisted(() => ({ deadline: false }));
vi.mock('./point-writes.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('./point-writes.ts')>();
  return {
    ...original,
    writeDeadline: (...args: Parameters<typeof original.writeDeadline>) => {
      if (refuse.deadline) return Promise.reject(Object.assign(new Error('refused'), { name: 'QuotaExceededError' }));
      return original.writeDeadline(...args);
    },
  };
});

const SNAPSHOT: RelatorioSnapshot = buildSnapshot(replay(portoSeguroSmall.log), RELATORIO);
const EQUIPMENT = SNAPSHOT.blocks.find((block) => block.equipment_id !== null)!.equipment_id!;

const FROM_TEST: PointSeed = { text: 'Ensaio de isolação: 300 MΩ em Fase A–Massa (critério: >400 MΩ)', equipmentId: EQUIPMENT, origin: 'reading', testKey: 'isolacao' };
const FROM_NC: PointSeed = { text: 'Item 3 (Isoladores): trincados', equipmentId: EQUIPMENT, origin: 'nc', itemKey: 'isoladores' };

async function freshDatabase(): Promise<AppDatabase> {
  const name = `019966c1-0a61-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(name).delete();
  const db = openDatabase(name);
  await applyPulled(db, portoSeguroSmall.log);
  await db.outbox.clear();
  return db;
}

function renderAction(seed: PointSeed) {
  return render(
    <MemoryRouter>
      <I18nProvider locale="pt-BR">
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <DraftProvider>
            <CreatePointAction relatorioId={RELATORIO} snapshot={SNAPSHOT} seed={() => seed} />
            <ToastOutlet />
          </DraftProvider>
        </ToastProvider>
      </SyncContext>
      </I18nProvider>
    </MemoryRouter>,
  );
}

const pause = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const pointDrafts = async () => (await database!.drafts.toArray()).filter((row) => row.surface === POINT_DRAFT_SURFACE);
const pointCreates = async () => (await database!.outbox.toArray()).filter((op) => op.kind === 'create' && op.path.startsWith('point/'));

/** Opens the editor and types the Prazo by hand (15/03/2031); the deadline commits after its idle pause. */
async function openAndTypePrazo(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: 'Criar ponto de atenção' }));
  const dialog = await screen.findByRole('dialog');
  const prazo = within(dialog).getByRole('group', { name: 'Prazo' });
  const [day] = within(prazo).getAllByRole('spinbutton');
  await userEvent.click(day!);
  await userEvent.keyboard('15032031');
  // The deadline's idle commit (500 ms) lands, with the draft autosave (300 ms) before it.
  await pause(900);
  return dialog;
}

describe('G1-WEB a new point with a typed Prazo leaves no draft once "Concluir" stores it', () => {
  for (const [name, seed] of [
    ['from a test', FROM_TEST],
    ['from an NC item', FROM_NC],
  ] as const) {
    it(`${name}: the point is stored with its deadline and no drafts row of it is left`, async () => {
      database = await freshDatabase();
      refuse.deadline = false;
      renderAction(seed);
      const dialog = await openAndTypePrazo();
      await userEvent.type(within(dialog).getByRole('textbox', { name: 'Ação recomendada' }), 'Trocar.');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Concluir' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(async () => expect(await pointCreates()).toHaveLength(1));
      const created = (await pointCreates())[0]!;
      const id = (created.value as { id: string }).id;
      const deadlines = (await database!.outbox.toArray()).filter((op) => op.path === `point/${id}/deadline` || op.path === `point/${id}`);
      expect(deadlines.some((op) => (op.kind === 'create' ? (op.value as { deadline: string | null }).deadline : op.value) === '2031-03-15')).toBe(true);
      // Every write and draft save has settled.
      await pause(600);
      expect(await pointDrafts()).toEqual([]);
      database.close();
    });
  }

  it('control: a refused deadline write keeps the editor open and the draft of the typed Prazo', async () => {
    database = await freshDatabase();
    refuse.deadline = true;
    renderAction(FROM_TEST);
    const dialog = await openAndTypePrazo();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Concluir' }));
    await pause(600);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const drafts = await pointDrafts();
    expect(drafts).toHaveLength(1);
    expect((drafts[0]!.value as { pending: { deadline?: string } }).pending.deadline).toBe('2031-03-15');
    refuse.deadline = false;
    database.close();
  });

  it('control: a priority tap with no typed Prazo leaves no draft', async () => {
    database = await freshDatabase();
    refuse.deadline = false;
    renderAction(FROM_NC);
    await userEvent.click(screen.getByRole('button', { name: 'Criar ponto de atenção' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getAllByRole('radio')[0]!);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(async () => expect(await pointCreates()).toHaveLength(1));
    await pause(600);
    expect(await pointDrafts()).toEqual([]);
    database.close();
  });
});
