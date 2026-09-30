import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { useCamera } from './camera-view.tsx';

/*
 * W-13 (review 2026-09-30): "Concluir fotos" waits for the shots to be stored, then closes the
 * camera. A store that rejects (a refused commit) must still close it, stop the stream and
 * leave the next "Concluir fotos" working, never a view stuck open with a live camera.
 */

const capture = vi.hoisted(() => ({
  prepare: vi.fn(async () => {}),
  shoot: vi.fn(),
  settle: vi.fn<() => Promise<boolean>>(),
  ready: true,
}));
vi.mock('./use-photo-capture.ts', () => ({ usePhotoCapture: () => capture }));

const stop = vi.fn();
const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;

function Harness() {
  const opener = useRef<HTMLButtonElement>(null);
  const camera = useCamera('019966b0-0000-7000-8000-000000000001', () => ({ blockId: null, itemKey: null, caption: null }), opener);
  return (
    <>
      <button type="button" ref={opener} onClick={camera.open}>
        Abrir câmera
      </button>
      {camera.element}
    </>
  );
}

beforeEach(() => {
  stop.mockReset();
  capture.settle.mockReset();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => stream) } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('W-13 "Concluir fotos" when storing the shots fails', () => {
  it('closes the camera and stops the stream, and the next "Concluir fotos" still works', async () => {
    capture.settle.mockRejectedValueOnce(new Error('refused'));
    render(
      <ToastProvider>
        <Harness />
        <ToastOutlet />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Concluir fotos' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Câmera' })).toBeNull());
    expect(stop).toHaveBeenCalled();

    capture.settle.mockResolvedValueOnce(true);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Concluir fotos' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Câmera' })).toBeNull());
    expect(capture.settle).toHaveBeenCalledTimes(2);
  });
});
