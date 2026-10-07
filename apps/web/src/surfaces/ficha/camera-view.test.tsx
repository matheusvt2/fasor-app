import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncContext } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
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

function Harness({ single = false }: { single?: boolean }) {
  const opener = useRef<HTMLButtonElement>(null);
  const camera = useCamera('019966b0-0000-7000-8000-000000000001', () => ({ blockId: null, itemKey: null, caption: null }), opener, { singleShot: single });
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

describe('F-13 (review 2026-10-06) the "Concluir fotos" toast', () => {
  async function finish(sync: ReturnType<typeof makeSyncState> | null): Promise<void> {
    capture.settle.mockResolvedValueOnce(true);
    const tree = (
      <ToastProvider>
        <Harness />
        <ToastOutlet />
      </ToastProvider>
    );
    render(sync === null ? tree : <SyncContext value={sync}>{tree}</SyncContext>);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Concluir fotos' }));
  }

  it('with the server reachable says the photos are being sent, never a queue', async () => {
    await finish(makeSyncState());
    expect(await screen.findByText('Fotos salvas — enviando')).toBeVisible();
    expect(screen.queryByText(/fila de envio/)).toBeNull();
  });

  it('offline or with the server unreachable keeps the queued words', async () => {
    await finish(makeSyncState({ online: false }));
    expect(await screen.findByText('Fotos salvas neste aparelho — entram na fila de envio')).toBeVisible();
  });
});

describe('F-13 (review 2026-10-06) the single shot\'s toast (a plate, "Ler visor")', () => {
  async function shootOne(sync: ReturnType<typeof makeSyncState>): Promise<void> {
    // No camera on the device: the single shot goes through the system picker.
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'))) },
    });
    capture.settle.mockResolvedValueOnce(true);
    render(
      <SyncContext value={sync}>
        <ToastProvider>
          <Harness single />
          <ToastOutlet />
        </ToastProvider>
      </SyncContext>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    const input = screen.getByTestId('camera-fallback-input');
    await waitFor(() => expect(capture.prepare).toHaveBeenCalled());
    fireEvent.change(input, { target: { files: [new File(['x'], 'placa.jpg', { type: 'image/jpeg' })] } });
  }

  it('with the server reachable says the photo is being sent', async () => {
    await shootOne(makeSyncState());
    expect(await screen.findByText('Foto salva — enviando')).toBeVisible();
  });

  it('offline keeps the queued words', async () => {
    await shootOne(makeSyncState({ online: false }));
    expect(await screen.findByText('Foto salva neste aparelho — entra na fila de envio')).toBeVisible();
  });
});

describe('F-26 (review 2026-10-06) the camera while the permission prompt is open', () => {
  function OpeningHarness() {
    const opener = useRef<HTMLButtonElement>(null);
    const camera = useCamera('019966b0-0000-7000-8000-000000000001', () => ({ blockId: null, itemKey: null, caption: null }), opener, { singleShot: true });
    return (
      <>
        <button type="button" ref={opener} onClick={camera.open} data-state={camera.opening ? 'opening' : undefined}>
          Abrir câmera
        </button>
        {camera.element}
      </>
    );
  }

  /** A `getUserMedia` the test answers later, as a permission prompt does. */
  function deferredCamera() {
    let resolve: (value: MediaStream) => void = () => undefined;
    let reject: (reason: unknown) => void = () => undefined;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((res, rej) => {
          resolve = res;
          reject = rej;
        }),
    );
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    return { getUserMedia, resolve: (s: MediaStream) => resolve(s), reject: (e: unknown) => reject(e) };
  }

  it('is opening until the prompt answers, and a second press does not ask again', async () => {
    const camera = deferredCamera();
    render(
      <ToastProvider>
        <OpeningHarness />
      </ToastProvider>,
    );
    const button = screen.getByRole('button', { name: 'Abrir câmera' });
    await userEvent.click(button);
    expect(button).toHaveAttribute('data-state', 'opening');
    await userEvent.click(button);
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
    camera.resolve(stream);
    await waitFor(() => expect(button).not.toHaveAttribute('data-state'));
    expect(await screen.findByRole('dialog', { name: 'Câmera' })).toBeInTheDocument();
  });

  it('clears on a denial, and on the no-camera path before the picker opens', async () => {
    const denied = deferredCamera();
    const { unmount } = render(
      <ToastProvider>
        <OpeningHarness />
      </ToastProvider>,
    );
    const button = screen.getByRole('button', { name: 'Abrir câmera' });
    await userEvent.click(button);
    expect(button).toHaveAttribute('data-state', 'opening');
    denied.reject(new DOMException('Permission denied', 'NotAllowedError'));
    await waitFor(() => expect(button).not.toHaveAttribute('data-state'));
    unmount();

    const missing = deferredCamera();
    render(
      <ToastProvider>
        <OpeningHarness />
      </ToastProvider>,
    );
    const again = screen.getByRole('button', { name: 'Abrir câmera' });
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click');
    await userEvent.click(again);
    expect(again).toHaveAttribute('data-state', 'opening');
    missing.reject(new DOMException('Requested device not found', 'NotFoundError'));
    await waitFor(() => expect(again).not.toHaveAttribute('data-state'));
    expect(picker).toHaveBeenCalled();
  });

  it('clears when getUserMedia throws at once, and takes the system camera instead', async () => {
    const getUserMedia = vi.fn(() => {
      throw new TypeError('getUserMedia is broken');
    });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click');
    render(
      <ToastProvider>
        <OpeningHarness />
      </ToastProvider>,
    );
    const button = screen.getByRole('button', { name: 'Abrir câmera' });
    await userEvent.click(button);
    expect(button).not.toHaveAttribute('data-state');
    expect(picker).toHaveBeenCalled();
    await userEvent.click(button);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });
});
