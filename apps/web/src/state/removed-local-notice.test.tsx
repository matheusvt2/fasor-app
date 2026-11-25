import type { LocationRemovalDecision } from '@app/domain';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeldDecisions } from '../db/decision-store.ts';
import type { Timers } from '../input/field-commit.ts';
import { RemovedLocalNotice } from './removed-local-notice.tsx';
import { ToastOutlet, ToastProvider, useToast } from './toast.tsx';

/*
 * Fix batch e30h, item 2 (Story 30.4's Toast): each removed-local notice is shown once and really shown. It waits behind
 * any toast on screen, no other arrival ("N leituras prontas — Ver") takes the slot from it, a toast that does take it
 * (the answer to the user's own press) sends it back to wait, and the device writes that it told it only when it is on
 * screen, so a notice still waiting when the page reloads is told after the reload.
 */

const BRUNO = '019966b0-0030-7000-8000-000000000009';
const ANA = '019966b0-0030-7000-8000-000000000008';
const RELATORIO = '019966b0-0003-7000-8000-000000000003';
const LOCAL_A = '019966b0-0030-7000-8000-000000000001';
const LOCAL_B = '019966b0-0030-7000-8000-000000000002';

const mocked = vi.hoisted(() => ({
  held: [] as unknown[],
  stored: [] as string[],
  writes: [] as string[][],
}));

vi.mock('./session.tsx', () => ({ useSession: () => ({ database: { name: 'device' }, user: { id: '019966b0-0030-7000-8000-000000000009' } }) }));
vi.mock('./sync.tsx', () => ({
  useSync: () => ({ heldDecisions: mocked.held, userNames: { '019966b0-0030-7000-8000-000000000008': 'Ana Andrade' }, deviceId: 'tablet-bruno' }),
}));
vi.mock('./definition-context.ts', async () => {
  const domain = await import('@app/domain');
  return { useDefinitionContext: () => domain.EMPTY_DEFINITION_CONTEXT };
});
vi.mock('../db/prefs.ts', () => ({
  readRemovedLocalTold: async () => [...mocked.stored],
  writeRemovedLocalTold: async (_db: unknown, keys: readonly string[]) => {
    mocked.stored = [...keys];
    mocked.writes.push([...keys]);
  },
}));

function fakeTimers(): Timers & { run(): void } {
  const queue = new Map<number, () => void>();
  let seq = 0;
  return {
    setTimeout(cb) {
      const id = ++seq;
      queue.set(id, cb);
      return id;
    },
    clearTimeout(handle) {
      queue.delete(handle as number);
    },
    run() {
      const entries = [...queue.entries()];
      queue.clear();
      for (const [, cb] of entries) cb();
    },
  };
}

const decision = (locationId: string, removedAt: string): LocationRemovalDecision => ({
  kind: 'location_removal',
  relatorio_id: RELATORIO,
  location_id: locationId,
  removed_by: ANA,
  removed_at: removedAt,
  edited_by: BRUNO,
  edited_at: removedAt,
  answers: 3,
  photos: 0,
  points: 0,
});

const local = (id: string, name: string) => ({ id, relatorio_id: RELATORIO, parent_id: null, kind: 'cabine', name, order_key: 'a0', removed_at: '2026-11-25T12:00:00.000Z' });

const held = (...decisions: LocationRemovalDecision[]): HeldDecisions[] => [
  { relatorioId: RELATORIO, projectId: RELATORIO, decisions, blocks: [], equipment: [], locations: [local(LOCAL_A, 'Cubículo Enel'), local(LOCAL_B, 'Casa de bombas')] } as unknown as HeldDecisions,
];

const A = decision(LOCAL_A, '2026-11-25T12:00:00.000Z');
const B = decision(LOCAL_B, '2026-11-25T12:01:00.000Z');
const TEXT_A = 'Cubículo Enel foi removido por Ana. Suas 3 respostas não foram mantidas.';
const TEXT_B = 'Casa de bombas foi removido por Ana. Suas 3 respostas não foram mantidas.';

function Buttons() {
  const { showToast, dismissToast } = useToast();
  return (
    <>
      <button type="button" onClick={() => showToast('2 leituras prontas', { action: { label: 'Ver', onPress: () => undefined }, arrival: true })}>
        leituras
      </button>
      <button type="button" onClick={() => showToast('Revisão 1 pronta', { outcome: true })}>
        revisão
      </button>
      <button type="button" onClick={() => showToast('2 fotos adicionadas', {})}>
        fotos
      </button>
      <button type="button" onClick={() => showToast('Seção removida', { action: { label: 'Desfazer', onPress: () => undefined } })}>
        desfazer
      </button>
      <button type="button" onClick={dismissToast}>
        fechar
      </button>
    </>
  );
}

/** The shell's toast slot with the notice watcher; `notice: false` leaves the watcher out until `rerender`. */
function Shell({ timers, notice = true }: { timers: Timers; notice?: boolean }) {
  return (
    <MemoryRouter>
      <ToastProvider timers={timers}>
        <Buttons />
        {notice ? <RemovedLocalNotice /> : null}
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>
  );
}

const toastText = () => screen.queryByTestId('toast')?.textContent ?? null;
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const close = () => userEvent.click(screen.getByText('fechar'));

beforeEach(() => {
  mocked.held = [];
  mocked.stored = [];
  mocked.writes = [];
});

describe('e30h-UNIT-002 the removed-local notice is shown once and really shown', () => {
  it('two marked locals in one cycle: both notices show, one after the other', async () => {
    mocked.held = held(A, B);
    render(<Shell timers={fakeTimers()} />);
    await settle();
    expect(toastText()).toContain(TEXT_A);
    await close();
    expect(toastText()).toContain(TEXT_B);
    await close();
    expect(toastText()).toBeNull();
  });

  it('a reading arrival on the poll waits behind the notice; it is shown after it, its "Ver" kept', async () => {
    mocked.held = held(A);
    render(<Shell timers={fakeTimers()} />);
    await settle();
    expect(toastText()).toContain(TEXT_A);
    await userEvent.click(screen.getByText('leituras'));
    expect(toastText()).toContain(TEXT_A);
    await close();
    expect(toastText()).toContain('2 leituras prontas');
    expect(toastText()).toContain('Ver');
  });

  it('a notice raised over "N leituras prontas — Ver" waits behind it; neither is lost', async () => {
    mocked.held = held(A);
    const timers = fakeTimers();
    const { rerender } = render(<Shell timers={timers} notice={false} />);
    await userEvent.click(screen.getByText('leituras'));
    rerender(<Shell timers={timers} />);
    await settle();
    expect(toastText()).toContain('2 leituras prontas');
    await close();
    expect(toastText()).toContain(TEXT_A);
  });

  it('the answer to the user\'s own press takes the slot; the notice comes back after it', async () => {
    mocked.held = held(A);
    render(<Shell timers={fakeTimers()} />);
    await settle();
    await userEvent.click(screen.getByText('desfazer'));
    expect(toastText()).toContain('Seção removida');
    await close();
    expect(toastText()).toContain(TEXT_A);
  });

  it('Story 30.5 kept: a notice waits behind the plain answer to a press for its 6 s', async () => {
    mocked.held = held(A);
    const timers = fakeTimers();
    const { rerender } = render(<Shell timers={timers} notice={false} />);
    await userEvent.click(screen.getByText('fotos'));
    rerender(<Shell timers={timers} />);
    await settle();
    expect(toastText()).toContain('2 fotos adicionadas');
    act(() => timers.run());
    expect(toastText()).toContain(TEXT_A);
  });

  it('the device writes that it told the notice when the notice shows, not while it waits; a reload while it waits tells it then', async () => {
    mocked.held = held(A);
    const timers = fakeTimers();
    const first = render(<Shell timers={timers} notice={false} />);
    await userEvent.click(screen.getByText('revisão'));
    first.rerender(<Shell timers={timers} />);
    await settle();
    expect(toastText()).toContain('Revisão 1 pronta');
    expect(mocked.writes).toEqual([]);
    // The page reloads while the notice still waits behind the outcome.
    first.unmount();
    render(<Shell timers={fakeTimers()} />);
    await settle();
    expect(toastText()).toContain(TEXT_A);
    expect(mocked.stored).toEqual([`${LOCAL_A}:${A.removed_at}`]);
  });
});
