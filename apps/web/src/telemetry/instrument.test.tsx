import 'fake-indexeddb/auto';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Button } from '../components/index.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { queuedUxEvents } from '../db/ux-events-store.ts';
import { installTelemetryListeners } from './instrument.ts';
import { configureTelemetry, resetTelemetryForTests, whenTelemetryWritten } from './track.ts';

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
    // A natively disabled button gets no click; the pointer still lands on it.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Pré-visualizar' }));
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
