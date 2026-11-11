import 'fake-indexeddb/auto';
import type { PointRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { PointsSurface } from './points-surface.tsx';

/*
 * Story 24.7: a point whose ficha finding no longer stands ("Origem resolvida", the kernel's
 * `resolvedOriginPoints`) offers "Remover ponto" beside its flag on the Pontos screen. It opens
 * the existing removal confirmation, and "Desfazer" restores the point. A point with no flag has
 * no such action.
 */

const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RELATORIO = portoSeguroSmall.relatorioId;
const EQUIPMENT = portoSeguroSmall.log.find((op) => op.kind === 'create' && op.path.startsWith('equipment/'))!.path.split('/')[1]!;
const id = (n: number) => `019966c1-0247-7000-8000-${n.toString(16).padStart(12, '0')}`;
const RESOLVED = id(1);
const MANUAL = id(2);

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
vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => () => Promise.resolve(), useDrafts: () => ({ register: () => () => undefined }) }));

configure({ asyncUtilTimeout: 5000 });

const pointRow = (pointId: string, over: Partial<PointRow>): PointRow => ({
  id: pointId,
  relatorio_id: RELATORIO,
  text: 'Ponto de teste',
  equipment_id: EQUIPMENT,
  origin: 'manual',
  order_key: 'y0',
  removed_at: null,
  action: 'Acompanhar',
  priority: null,
  deadline: null,
  owner: null,
  ...over,
});

async function open(): Promise<void> {
  const user = `019966c1-0248-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(user).delete();
  database = openDatabase(user);
  await applyPulled(database, portoSeguroSmall.log);
  // An NC point whose item is no NC row of its sheet (the row went back to C): its origin is resolved.
  await database.entities.bulkPut([
    toRecord(`point:${MANUAL}`, pointRow(MANUAL, { order_key: 'y0', text: 'Ponto à mão' }) as never),
    toRecord(`point:${RESOLVED}`, pointRow(RESOLVED, { order_key: 'y1', origin: 'nc', item_key: 'item_que_nao_esta_nc', text: 'Ponto de item resolvido' }) as never),
  ]);
  render(
    <MemoryRouter initialEntries={[`/relatorio/${RELATORIO}/pontos`]}>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <Routes>
            <Route path="/relatorio/:id/pontos" element={<PointsSurface />} />
          </Routes>
          <ToastOutlet />
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
  await screen.findByText('Ponto de item resolvido');
}

const cardOf = (text: string) => screen.getByText(text).closest<HTMLElement>('.point-of-attention-card')!;
const outbox = async () => (await database!.outbox.toArray()).map((op) => [op.path, op.kind, op.value]);

afterEach(() => {
  database?.close();
  database = null;
});

describe('24.7 "Remover ponto" beside "Origem resolvida" on the Pontos screen', () => {
  it('the flagged card offers it, it opens the removal confirmation, and "Desfazer" restores the point', async () => {
    await open();
    const card = cardOf('Ponto de item resolvido');
    const flagRow = card.querySelector('.poa-flag-row')!;
    expect(within(flagRow as HTMLElement).getByText('Item alterado')).toHaveAttribute('data-flag');
    // A manual point has no flag and no such action.
    expect(cardOf('Ponto à mão').querySelector('.poa-flag-row')).toBeNull();

    await userEvent.click(within(flagRow as HTMLElement).getByRole('button', { name: 'Remover ponto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remover este ponto de atenção?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover ponto' }));
    await waitFor(async () => expect(await outbox()).toEqual([[`point/${RESOLVED}/removed_at`, 'remove', null]]));
    await waitFor(() => expect(screen.queryByText('Ponto de item resolvido')).toBeNull());

    await userEvent.click(within(await screen.findByTestId('toast')).getByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect((await outbox()).at(-1)).toEqual([`point/${RESOLVED}/removed_at`, 'put', null]));
    expect(await screen.findByText('Ponto de item resolvido')).toBeVisible();
  });
});
