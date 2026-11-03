import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { queuedUxEvents } from '../../db/ux-events-store.ts';
import { ToastProvider } from '../../state/toast.tsx';
import { configureTelemetry, resetTelemetryForTests, whenTelemetryWritten } from '../../telemetry/track.ts';
import { CnpjField } from './cnpj-field.tsx';

/*
 * Story 18.4: a CNPJ the field refuses on blur queues one `input_refused`
 * (`cadastros.cnpj`, `bad_format`), and no event carries the typed text.
 */

const DEVICE = '019966b0-0041-7000-8000-0000000000dd';
let counter = 0;
let db: AppDatabase;

beforeEach(async () => {
  resetTelemetryForTests();
  db = openDatabase(`019966b0-0041-7000-8000-${(++counter).toString(16).padStart(12, '0')}`);
  await db.open();
  configureTelemetry({ db, deviceId: DEVICE });
});

afterEach(() => {
  configureTelemetry(null);
  db.close();
});

function renderField(onCommit = vi.fn()) {
  render(
    <ToastProvider>
      <CnpjField value="" label="CNPJ" invalidText="CNPJ deve ter 14 dígitos" onCommit={onCommit} />
      <button type="button">fora</button>
    </ToastProvider>,
  );
  return onCommit;
}

describe('CnpjField refusals (Story 18.4)', () => {
  it('a refused CNPJ on blur is one input_refused with the field name and bad_format, never the text', async () => {
    const onCommit = renderField();
    const input = screen.getByRole('textbox', { name: 'CNPJ' });
    expect(input).toHaveAttribute('data-telemetry', 'cadastros.cnpj');
    await userEvent.type(input, '98765');
    await whenTelemetryWritten();
    expect(await queuedUxEvents(db)).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(screen.getByRole('alert')).toHaveTextContent('CNPJ deve ter 14 dígitos');
    await whenTelemetryWritten();
    const events = await queuedUxEvents(db);
    expect(events.map(({ name, target, kind }) => ({ name, target, kind }))).toEqual([{ name: 'input_refused', target: 'cadastros.cnpj', kind: 'bad_format' }]);
    expect(JSON.stringify(events)).not.toContain('98765');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a blank or a 14-digit CNPJ queues nothing', async () => {
    renderField();
    const input = screen.getByRole('textbox', { name: 'CNPJ' });
    await userEvent.click(input);
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    await userEvent.type(input, '12345678000190');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    await whenTelemetryWritten();
    expect(await queuedUxEvents(db)).toEqual([]);
  });
});
