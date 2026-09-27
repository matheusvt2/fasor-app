import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { CropThumb } from './crop-thumb.tsx';
import { SuggestionField } from './suggestion-field.tsx';

/*
 * 8.1-UNIT: the Suggestion field's three states, its pills and the Confirmar button's
 * announcement, and the source crop (its name, its alt, the fetch of the original).
 */

const session: { database: AppDatabase | null } = { database: null };
const sync = { fetchFile: vi.fn<(id: string, variant: string) => Promise<Blob>>() };
vi.mock('../state/session.tsx', () => ({ useSession: () => session }));
vi.mock('../state/sync.tsx', () => ({ useSync: () => sync }));

afterEach(() => {
  cleanup();
  session.database?.close();
  session.database = null;
  sync.fetchFile.mockReset();
});

describe('8.1-UNIT SuggestionField', () => {
  it('suggested: the amber state, the "Sugerido" pill and the announced Confirmar', async () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <SuggestionField label="Tensão de placa" announcement="Sugerido, 15 kV, confirmar" onConfirm={onConfirm}>
        15 kV
      </SuggestionField>,
    );
    const field = container.querySelector('.field.suggestion-field')!;
    expect(field.getAttribute('data-state')).toBe('suggested');
    expect(container.querySelector('.suggested-pill')?.textContent).toBe('Sugerido');
    expect(container.querySelector('.verify-pill')).toBeNull();
    expect(container.querySelector('.sv')?.textContent).toBe('15 kV');
    await userEvent.click(screen.getByRole('button', { name: 'Sugerido, 15 kV, confirmar' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('verify: the dashed state and the "Verificar" pill; the combobox variant keeps its chevron', () => {
    const { container } = render(
      <SuggestionField label="Fabricante" state="verify" combobox announcement="Verificar, Schneidr, confirmar" onConfirm={() => {}}>
        Schneidr
      </SuggestionField>,
    );
    expect(container.querySelector('.field.suggestion-field.combobox')?.getAttribute('data-state')).toBe('verify');
    expect(container.querySelector('.verify-pill')?.textContent).toBe('Verificar');
    expect(container.querySelector('.suggested-pill')).toBeNull();
    expect(container.querySelector('.combobox-chevron')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Verificar, Schneidr, confirmar' })).toBeDefined();
  });

  it('confirmed: no pill and no Confirmar', () => {
    const { container } = render(
      <SuggestionField label="Fabricante" state="confirmed" onConfirm={() => {}}>
        Schneider
      </SuggestionField>,
    );
    expect(container.querySelector('.suggestion-field')?.getAttribute('data-state')).toBe('confirmed');
    expect(container.querySelector('.suggested-pill, .verify-pill, .confirm-btn')).toBeNull();
  });

  it('keeps the Story 5.8 defaults: the value describes Confirmar and sits in `.sv`', () => {
    render(
      <SuggestionField label="Texto" onConfirm={() => {}}>
        O equipamento está apto.
      </SuggestionField>,
    );
    const button = screen.getByRole('button', { name: 'Confirmar' });
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe('O equipamento está apto.');
  });

  it('bare: the caller renders its own value slot in the measurement layout', () => {
    const { container } = render(
      <SuggestionField label="Corrente nominal" valueClassName="measurement-field" bare onConfirm={() => {}} announcement="Sugerido, 630 A, confirmar">
        <input className="mf-value" defaultValue="630" aria-label="Corrente nominal" />
        <span className="mf-unit">A</span>
      </SuggestionField>,
    );
    expect(container.querySelector('.measurement-field > input.mf-value')).not.toBeNull();
    expect(container.querySelector('.measurement-field > .mf-unit')?.textContent).toBe('A');
    expect(container.querySelector('.sv')).toBeNull();
  });
});

describe('8.1-UNIT CropThumb', () => {
  const PHOTO = '019966b0-0081-7000-8000-0000000000c1';

  it('names its button after the field and shows the placeholder, with the crop alt, when no picture exists', async () => {
    session.database = openDatabase('crop-thumb-1');
    sync.fetchFile.mockRejectedValue(new Error('404'));
    const onPress = vi.fn();
    const { container } = render(<CropThumb photoId={PHOTO} bbox={[0.1, 0.2, 0.3, 0.4]} label="Fabricante" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Ver recorte da placa — Fabricante' });
    expect(button.classList.contains('crop-thumb')).toBe(true);
    expect(container.querySelector('.thumb-fake')?.getAttribute('aria-label')).toBe('Recorte da placa');
    await waitFor(() => expect(sync.fetchFile).toHaveBeenCalledWith(PHOTO, 'original'));
    expect(container.querySelector('img')).toBeNull();
    await userEvent.click(button);
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('draws the original the server holds as an image with the crop alt', async () => {
    session.database = openDatabase('crop-thumb-2');
    const url = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:crop');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    sync.fetchFile.mockResolvedValue(new NodeBlob(['jpeg']) as unknown as Blob);
    const { container } = render(<CropThumb photoId={PHOTO} bbox={[0.1, 0.2, 0.3, 0.4]} label="Nº série" />);
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('alt')).toBe('Recorte da placa'));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:crop');
    url.mockRestore();
  });
});
