import 'fake-indexeddb/auto';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../components/index.ts';
import { TriStateControl } from '../components/tri-state-control.tsx';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { queuedUxEvents } from '../db/ux-events-store.ts';
import { beaconTelemetry } from './flush.ts';
import { installTelemetryListeners, resetStartTelemetryForTests, startTelemetry } from './instrument.ts';
import { configureTelemetry, resetTelemetryForTests, whenTelemetryWritten } from './track.ts';

// The beacon path is `flush.test.ts`'s; here only that the listeners call it.
vi.mock('./flush.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flush.ts')>()),
  beaconTelemetry: vi.fn(async () => undefined),
}));

const DEVICE = '019966b0-0032-7000-8000-0000000000dd';

let counter = 0;
let db: AppDatabase;
let uninstall: () => void = () => undefined;

beforeEach(async () => {
  resetTelemetryForTests();
  db = openDatabase(`019966b0-0032-7000-8000-${(++counter).toString(16).padStart(12, '0')}`);
  await db.open();
  configureTelemetry({ db, deviceId: DEVICE });
  uninstall = installTelemetryListeners(document);
});

afterEach(() => {
  vi.mocked(beaconTelemetry).mockClear();
  uninstall();
  configureTelemetry(null);
  db.close();
});

async function queued() {
  await whenTelemetryWritten();
  return (await queuedUxEvents(db)).map(({ name, target, screen }) => ({ name, target, screen }));
}

describe('data-telemetry controls (Story 18.1)', () => {
  it('queues an action with the control name when an enabled control is pressed', async () => {
    render(
      <Button variant="primary" data-telemetry="ficha.conclude" onPress={() => undefined}>
        Concluir
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(await queued()).toEqual([{ name: 'action', target: 'ficha.conclude', screen: 'home' }]);
  });

  it('queues a disabled_tap, and no action, when a control is pressed while disabled', async () => {
    render(
      <>
        <Button variant="primary" data-telemetry="sumario.generate" isDisabled disabledReason="Conclua as fichas.">
          Gerar relatório
        </Button>
        <button type="button" data-telemetry="sumario.preview" disabled>
          Pré-visualizar
        </button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Gerar relatório' }));
    // A natively disabled button gets no click; the pointer (a primary one, as a mouse or a first finger is) still lands on it.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Pré-visualizar' }), { isPrimary: true });
    expect(await queued()).toEqual([
      { name: 'disabled_tap', target: 'sumario.generate', screen: 'home' },
      { name: 'disabled_tap', target: 'sumario.preview', screen: 'home' },
    ]);
  });

  it('names the event from data-telemetry-event (retry, undo) and the press from the closest control', async () => {
    render(
      <>
        <button type="button" data-telemetry="reading.retry" data-telemetry-event="retry">
          <span>Tentar novamente</span>
        </button>
        <button type="button" data-telemetry="toast.undo" data-telemetry-event="undo">
          Desfazer
        </button>
        <button type="button">Sem nome</button>
      </>,
    );
    await userEvent.click(screen.getByText('Tentar novamente'));
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sem nome' }));
    expect(await queued()).toEqual([
      { name: 'retry', target: 'reading.retry', screen: 'home' },
      { name: 'undo', target: 'toast.undo', screen: 'home' },
    ]);
  });

  it('reads a data-telemetry-event outside retry and undo as a plain action, and ignores a malformed name', async () => {
    render(
      <>
        <button type="button" data-telemetry="home.card_open" data-telemetry-event="session_start">
          A
        </button>
        <button type="button" data-telemetry="Cabine 1">
          B
        </button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'A' }));
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(await queued()).toEqual([{ name: 'action', target: 'home.card_open', screen: 'home' }]);
  });

  it('stops listening once uninstalled', async () => {
    uninstall();
    render(
      <button type="button" data-telemetry="home.summary">
        S
      </button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'S' }));
    expect(await queued()).toEqual([]);
  });
});

/** A pointerdown with the given fields, whatever pointer events this jsdom implements. */
function pointerDown(element: Element, fields: { button?: number; isPrimary?: boolean }): void {
  const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: fields.button ?? 0 });
  if (fields.isPrimary !== undefined) Object.defineProperty(event, 'isPrimary', { value: fields.isPrimary });
  element.dispatchEvent(event);
}

describe('E18-A1 fixes and gaps', () => {
  it('R-A6: pagehide on the window beacons the queue once, without a visibilitychange; uninstalled, it stops', () => {
    window.dispatchEvent(new Event('pagehide'));
    expect(beaconTelemetry).toHaveBeenCalledTimes(1);
    expect(vi.mocked(beaconTelemetry).mock.calls[0]![0]).toBe(db);
    uninstall();
    window.dispatchEvent(new Event('pagehide'));
    expect(beaconTelemetry).toHaveBeenCalledTimes(1);
  });

  it('R-E3: a press on a read-only Tri-state segment is a disabled_tap with its name, and no action', async () => {
    render(<TriStateControl value={null} onChange={() => undefined} aria-label="1. Limpeza" readOnly telemetry="ficha.mark" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Conforme' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Não se aplica' }));
    expect(await queued()).toEqual([
      { name: 'disabled_tap', target: 'ficha.mark_c', screen: 'home' },
      { name: 'disabled_tap', target: 'ficha.mark_na', screen: 'home' },
    ]);
  });

  it('R-E7: a secondary button or a second finger on a disabled control tracks nothing; the primary press does', async () => {
    render(
      <button type="button" data-telemetry="sumario.preview" disabled>
        Pré-visualizar
      </button>,
    );
    const control = screen.getByRole('button', { name: 'Pré-visualizar' });
    pointerDown(control, { button: 2 });
    pointerDown(control, { isPrimary: false });
    expect(await queued()).toEqual([]);
    pointerDown(control, { isPrimary: true });
    expect(await queued()).toEqual([{ name: 'disabled_tap', target: 'sumario.preview', screen: 'home' }]);
  });

  it('R-V8: a press inside data-telemetry-screen="export" is on the export screen; an unknown screen value is ignored', async () => {
    render(
      <>
        <div data-telemetry-screen="export">
          <button type="button" data-telemetry="sumario.generate">
            Gerar
          </button>
        </div>
        <div data-telemetry-screen="Exportar">
          <button type="button" data-telemetry="sumario.preview">
            Ver
          </button>
        </div>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Gerar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect(await queued()).toEqual([
      { name: 'action', target: 'sumario.generate', screen: 'export' },
      { name: 'action', target: 'sumario.preview', screen: 'home' },
    ]);
  });

  it('R-V11: startTelemetry twice installs the listeners once and queues one session_start', async () => {
    uninstall();
    try {
      startTelemetry();
      startTelemetry();
      render(
        <button type="button" data-telemetry="home.summary">
          S
        </button>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'S' }));
      expect(await queued()).toEqual([
        { name: 'session_start', target: undefined, screen: 'home' },
        { name: 'action', target: 'home.summary', screen: 'home' },
      ]);
    } finally {
      resetStartTelemetryForTests();
    }
  });
});
