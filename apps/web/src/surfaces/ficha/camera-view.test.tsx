import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoCaptureInput } from '../../db/file-commit.ts';
import { sessionCaptureRescue } from '../../files/capture-rescue.ts';
import { SyncContext } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { CAMERA_CONSTRAINTS, clampZoom, framePoint, TAKE_PHOTO_TIMEOUT_MS, useCamera } from './camera-view.tsx';

/*
 * W-13 (review 2026-09-30): "Concluir fotos" waits for the shots to be stored, then closes the
 * camera. A store that rejects (a refused commit) must still close it, stop the stream and
 * leave the next "Concluir fotos" working, never a view stuck open with a live camera.
 */

const capture = vi.hoisted(() => ({
  prepare: vi.fn(async () => {}),
  shoot: vi.fn(),
  settle: vi.fn<() => Promise<boolean>>(),
  retry: vi.fn<() => Promise<number>>(),
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

// --- Stories 13.1, 13.2 and 13.6 ------------------------------------------------------------

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
  getSettings: () => Record<string, unknown>;
  getCapabilities?: () => Record<string, unknown>;
  applyConstraints: ReturnType<typeof vi.fn>;
  readyState: 'live' | 'ended';
}

function cameraStream(capabilities?: Record<string, unknown>, settings: Record<string, unknown> = { width: 3840, height: 2160 }) {
  const track: FakeTrack = {
    stop: vi.fn(),
    getSettings: () => settings,
    applyConstraints: vi.fn(async () => undefined),
    readyState: 'live',
    ...(capabilities === undefined ? {} : { getCapabilities: () => capabilities }),
  };
  const media = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { track, media };
}

function useStream(media: MediaStream) {
  const getUserMedia = vi.fn(async () => media);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  return getUserMedia;
}

/** A live frame of the stream's size, and `createImageBitmap` reading the video at its intrinsic size. */
function liveFrames(width = 3840, height = 2160) {
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(width);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(height);
  const createImageBitmap = vi.fn(async (video: HTMLVideoElement) => ({ width: video.videoWidth, height: video.videoHeight, close: vi.fn() }));
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  return createImageBitmap;
}

function renderCamera(single = false) {
  return render(
    <ToastProvider>
      <Harness single={single} />
      <ToastOutlet />
    </ToastProvider>,
  );
}

const camera = () => screen.getByRole('dialog', { name: 'Câmera' });
const advanced = (track: FakeTrack): Record<string, unknown>[] =>
  track.applyConstraints.mock.calls.map((call) => (call[0] as { advanced: Record<string, unknown>[] }).advanced[0] ?? {});

describe('13.1 the full-resolution capture', () => {
  beforeEach(() => {
    capture.shoot.mockReset();
    capture.settle.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for the environment camera at ideal 3840x2160, logs the track settings once, and the burst shot is the frame at the stream\'s size', async () => {
    const { media } = cameraStream(undefined, { width: 3840, height: 2160, frameRate: 30 });
    const getUserMedia = useStream(media);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const grab = liveFrames(3840, 2160);
    renderCamera();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await screen.findByRole('dialog', { name: 'Câmera' });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith(CAMERA_CONSTRAINTS);
    expect(CAMERA_CONSTRAINTS).toEqual({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 }, zoom: true }, audio: false });
    expect(info.mock.calls.filter((call) => call[0] === 'camera track settings')).toEqual([['camera track settings', { width: 3840, height: 2160, frameRate: 30 }]]);

    await userEvent.click(screen.getByRole('button', { name: 'Disparar' }));
    await waitFor(() => expect(capture.shoot).toHaveBeenCalledTimes(1));
    expect(grab).toHaveBeenCalledTimes(1);
    expect(capture.shoot.mock.calls[0]![0]).toMatchObject({ width: 3840, height: 2160 });
    expect(info.mock.calls.filter((call) => call[0] === 'camera track settings')).toHaveLength(1);
  });

  it('a single shot is the camera\'s own photo where ImageCapture takes one', async () => {
    const { media, track } = cameraStream();
    useStream(media);
    const grab = liveFrames();
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' });
    const constructed: unknown[] = [];
    vi.stubGlobal(
      'ImageCapture',
      class {
        constructor(t: unknown) {
          constructed.push(t);
        }
        takePhoto = async () => photo;
      },
    );
    renderCamera(true);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await screen.findByRole('dialog', { name: 'Câmera' });
    await userEvent.click(screen.getByRole('button', { name: 'Disparar' }));
    await waitFor(() => expect(capture.shoot).toHaveBeenCalledTimes(1));
    expect(capture.shoot.mock.calls[0]![0]).toBe(photo);
    expect(constructed).toEqual([track]);
    // Review F-01: the frame of the tap was read before the photo was awaited; the photo won, so it is closed.
    expect(grab).toHaveBeenCalledTimes(1);
    const early = (await grab.mock.results[0]!.value) as { close: ReturnType<typeof vi.fn> };
    await waitFor(() => expect(early.close).toHaveBeenCalledTimes(1));
  });

  /** Review F-01: the viewfinder goes away (replaced, detached) once `takePhoto()` is under way. */
  function detachVideo(): void {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(0);
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(0);
  }

  it('review F-01: takePhoto rejects after the viewfinder went away; the frame of the tap is saved, no failure', async () => {
    const { media } = cameraStream();
    useStream(media);
    const grab = liveFrames(1920, 1080);
    vi.stubGlobal(
      'ImageCapture',
      class {
        takePhoto = async () => {
          detachVideo();
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new DOMException('setPhotoOptions failed', 'UnknownError');
        };
      },
    );
    renderCamera(true);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await screen.findByRole('dialog', { name: 'Câmera' });
    await userEvent.click(screen.getByRole('button', { name: 'Disparar' }));
    await waitFor(() => expect(capture.shoot).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(grab).toHaveBeenCalledTimes(1);
    expect(capture.shoot.mock.calls[0]![0]).toMatchObject({ width: 1920, height: 1080 });
    expect(screen.queryByText('Não foi possível salvar a foto. Tente de novo.')).toBeNull();
  });

  it('review F-01: takePhoto answers after the timeout with the viewfinder gone; the frame of the tap is saved and the late photo ignored', async () => {
    const { media } = cameraStream();
    useStream(media);
    const grab = liveFrames(1920, 1080);
    const late = new Blob(['late'], { type: 'image/jpeg' });
    vi.stubGlobal(
      'ImageCapture',
      class {
        takePhoto = () => {
          detachVideo();
          return new Promise<Blob>((resolve) => setTimeout(() => resolve(late), TAKE_PHOTO_TIMEOUT_MS + 300));
        };
      },
    );
    renderCamera(true);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await screen.findByRole('dialog', { name: 'Câmera' });
    await userEvent.click(screen.getByRole('button', { name: 'Disparar' }));
    await waitFor(() => expect(capture.shoot).toHaveBeenCalledTimes(1), { timeout: TAKE_PHOTO_TIMEOUT_MS + 1000 });
    expect(capture.shoot.mock.calls[0]![0]).toMatchObject({ width: 1920, height: 1080 });
    await new Promise((resolve) => setTimeout(resolve, 700));
    // One shot, one photo: the late answer is not saved too.
    expect(capture.shoot).toHaveBeenCalledTimes(1);
    expect(grab).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Não foi possível salvar a foto. Tente de novo.')).toBeNull();
  });

  it('review F-01: no frame at the tap (the stream had none yet) still waits for one, as before', async () => {
    const { media } = cameraStream();
    useStream(media);
    const grab = liveFrames(1920, 1080);
    grab.mockImplementationOnce(async () => Promise.reject(new DOMException('no frame', 'InvalidStateError')));
    vi.stubGlobal(
      'ImageCapture',
      class {
        takePhoto = async () => Promise.reject(new DOMException('photo failed', 'UnknownError'));
      },
    );
    renderCamera(true);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await screen.findByRole('dialog', { name: 'Câmera' });
    await userEvent.click(screen.getByRole('button', { name: 'Disparar' }));
    await waitFor(() => expect(capture.shoot).toHaveBeenCalledTimes(1));
    expect(grab).toHaveBeenCalledTimes(2);
    expect(capture.shoot.mock.calls[0]![0]).toMatchObject({ width: 1920, height: 1080 });
  });

  it('falls back to the frame grab when takePhoto rejects, and the shot still saves', async () => {
    const { media } = cameraStream();
    useStream(media);
    const grab = liveFrames(1920, 1080);
    vi.stubGlobal(
      'ImageCapture',
      class {
        takePhoto = async () => Promise.reject(new DOMException('photo failed', 'UnknownError'));
      },
    );
    renderCamera(true);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await screen.findByRole('dialog', { name: 'Câmera' });
    await userEvent.click(screen.getByRole('button', { name: 'Disparar' }));
    await waitFor(() => expect(capture.shoot).toHaveBeenCalledTimes(1));
    expect(grab).toHaveBeenCalledTimes(1);
    expect(capture.shoot.mock.calls[0]![0]).toMatchObject({ width: 1920, height: 1080 });
    expect(screen.queryByText('Não foi possível salvar a foto. Tente de novo.')).toBeNull();
  });

  it('falls back to the frame grab when takePhoto never answers', async () => {
    const { media } = cameraStream();
    useStream(media);
    liveFrames();
    vi.stubGlobal(
      'ImageCapture',
      class {
        takePhoto = () => new Promise<Blob>(() => undefined);
      },
    );
    renderCamera(true);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await screen.findByRole('dialog', { name: 'Câmera' });
    await userEvent.click(screen.getByRole('button', { name: 'Disparar' }));
    expect(capture.shoot).not.toHaveBeenCalled();
    await waitFor(() => expect(capture.shoot).toHaveBeenCalledTimes(1), { timeout: TAKE_PHOTO_TIMEOUT_MS + 2000 });
    expect(capture.shoot.mock.calls[0]![0]).toMatchObject({ width: 3840, height: 2160 });
  });

  it('without ImageCapture (Safari) the single shot is the frame grab, as before', async () => {
    const { media } = cameraStream();
    useStream(media);
    const grab = liveFrames();
    vi.stubGlobal('ImageCapture', undefined);
    renderCamera(true);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await screen.findByRole('dialog', { name: 'Câmera' });
    await userEvent.click(screen.getByRole('button', { name: 'Disparar' }));
    await waitFor(() => expect(capture.shoot).toHaveBeenCalledTimes(1));
    expect(grab).toHaveBeenCalledTimes(1);
  });
});

describe('13.2 torch, zoom and tap-to-focus from the track\'s capabilities', () => {
  const offered = { torch: true, zoom: { min: 1, max: 3, step: 0.5 }, focusMode: ['continuous', 'single-shot'] };

  beforeEach(() => {
    capture.settle.mockResolvedValue(true);
  });

  it('renders none of them when the track offers nothing', async () => {
    const { media } = cameraStream({});
    useStream(media);
    renderCamera();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await screen.findByRole('dialog', { name: 'Câmera' });
    expect(screen.queryByRole('button', { name: 'Lanterna' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Zoom' })).toBeNull();
    expect(document.querySelector('.cam-torch, .cam-zoom')).toBeNull();
  });

  it('the torch: a 48 px toggle in the top bar, applied through applyConstraints, off again in the next session', async () => {
    const first = cameraStream(offered);
    useStream(first.media);
    renderCamera();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    const torch = await screen.findByRole('button', { name: 'Lanterna' });
    expect(torch.closest('.cam-top')).not.toBeNull();
    expect(torch).toHaveAttribute('aria-pressed', 'false');
    // Off at the start of the session.
    await waitFor(() => expect(advanced(first.track)).toContainEqual({ torch: false }));
    await userEvent.click(torch);
    await waitFor(() => expect(torch).toHaveAttribute('aria-pressed', 'true'));
    expect(advanced(first.track)).toContainEqual({ torch: true });
    // The session's basic constraints go with the change, so the camera keeps its resolution.
    expect(first.track.applyConstraints).toHaveBeenCalledWith({
      facingMode: 'environment',
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      advanced: [{ torch: true }],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Fechar a câmera sem concluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Câmera' })).toBeNull());
    const second = cameraStream(offered);
    useStream(second.media);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    const again = await screen.findByRole('button', { name: 'Lanterna' });
    expect(again).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(advanced(second.track)).toEqual([{ torch: false }]));
  });

  it('a refused torch constraint leaves the toggle as it was', async () => {
    const { media, track } = cameraStream(offered);
    useStream(media);
    renderCamera();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    const torch = await screen.findByRole('button', { name: 'Lanterna' });
    track.applyConstraints.mockRejectedValue(new DOMException('no torch', 'OverconstrainedError'));
    await userEvent.click(torch);
    await waitFor(() => expect(advanced(track)).toContainEqual({ torch: true }));
    expect(torch).toHaveAttribute('aria-pressed', 'false');
  });

  it('the zoom: "-" and "+" with the readout, clamped to the range, never in the shutter row', async () => {
    const { media, track } = cameraStream(offered, { zoom: 1 });
    useStream(media);
    renderCamera();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    const group = await screen.findByRole('group', { name: 'Zoom' });
    expect(group.closest('.cam-bottom')).toBeNull();
    const zoomIn = screen.getByRole('button', { name: 'Aumentar zoom' });
    const zoomOut = screen.getByRole('button', { name: 'Diminuir zoom' });
    expect(group).toHaveTextContent('1,0×');
    expect(zoomOut).toBeDisabled();
    for (let i = 0; i < 4; i++) {
      await userEvent.click(zoomIn);
      await waitFor(() => expect(group).toHaveTextContent(`${(1 + 0.5 * (i + 1)).toFixed(1).replace('.', ',')}×`));
    }
    expect(group).toHaveTextContent('3,0×');
    expect(zoomIn).toBeDisabled();
    const zooms = advanced(track).flatMap((set) => (typeof set.zoom === 'number' ? [set.zoom] : []));
    expect(zooms).toEqual([1.5, 2, 2.5, 3]);
    await userEvent.click(zoomOut);
    await waitFor(() => expect(group).toHaveTextContent('2,5×'));
  });

  it('the zoom: a two-finger pinch on the finder scales it, clamped', async () => {
    const { media, track } = cameraStream(offered, { zoom: 1 });
    useStream(media);
    renderCamera();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    const group = await screen.findByRole('group', { name: 'Zoom' });
    const finder = screen.getByRole('img', { name: 'Visor da câmera' });
    fireEvent.pointerDown(finder, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(finder, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(finder, { pointerId: 2, clientX: 300, clientY: 100 });
    await waitFor(() => expect(group).toHaveTextContent('2,0×'));
    fireEvent.pointerMove(finder, { pointerId: 2, clientX: 900, clientY: 100 });
    await waitFor(() => expect(group).toHaveTextContent('3,0×'));
    fireEvent.pointerUp(finder, { pointerId: 2, clientX: 900, clientY: 100 });
    fireEvent.pointerUp(finder, { pointerId: 1, clientX: 100, clientY: 100 });
    const zooms = advanced(track).flatMap((set) => (typeof set.zoom === 'number' ? [set.zoom] : []));
    expect(Math.max(...zooms)).toBe(3);
    // A pinch is never a focus tap.
    expect(advanced(track).some((set) => 'pointsOfInterest' in set)).toBe(false);
  });

  it('a tap on the preview applies the point of interest and the focus mode, and marks it', async () => {
    const { media, track } = cameraStream(offered);
    useStream(media);
    renderCamera();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await screen.findByRole('dialog', { name: 'Câmera' });
    const finder = screen.getByRole('img', { name: 'Visor da câmera' });
    vi.spyOn(finder, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(finder, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerUp(finder, { pointerId: 1, clientX: 100, clientY: 50 });
    await waitFor(() => expect(advanced(track)).toContainEqual({ pointsOfInterest: [{ x: 0.25, y: 0.25 }], focusMode: 'single-shot' }));
    expect(finder.querySelector('.cam-focus-ring')).not.toBeNull();
  });

  it('clampZoom keeps a value on the range and its step; framePoint takes the covered overflow out', () => {
    const range = { min: 1, max: 3, step: 0.5 };
    expect(clampZoom(0.2, range)).toBe(1);
    expect(clampZoom(9, range)).toBe(3);
    expect(clampZoom(1.7, range)).toBe(1.5);
    expect(clampZoom(2, { min: 1, max: 5, step: 0 })).toBe(2);
    // A 16:9 frame covering a square box: the sides are cropped.
    expect(framePoint({ x: 50, y: 50 }, { width: 100, height: 100 }, { width: 1600, height: 900 })).toEqual({ x: 0.5, y: 0.5 });
    expect(framePoint({ x: 0, y: 0 }, { width: 100, height: 100 }, { width: 1600, height: 900 }).x).toBeCloseTo(0.21875);
    expect(framePoint({ x: 10, y: 10 }, { width: 100, height: 100 }, { width: 0, height: 0 })).toEqual({ x: 0.1, y: 0.1 });
  });
});

describe('13.6 a refused shot blocks the camera until it is stored', () => {
  const quota = () => Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
  const refusedShot = (): PhotoCaptureInput => ({
    companyId: 'c',
    relatorioId: 'r',
    actorId: 'u',
    fileId: 'held-1',
    blockId: null,
    itemKey: null,
    caption: null,
    capturedAt: '2026-10-07T12:00:00.000Z',
    tzOffset: -180,
    coords: null,
    original: new Blob(['o']),
    thumb: new Blob(['t']),
    sha256: 'ab',
  });
  const holdOne = () =>
    sessionCaptureRescue.save(refusedShot(), {
      isOnline: () => false,
      commit: async () => Promise.reject(quota()),
      sendDirect: async () => undefined,
    });
  const clearHeld = () => sessionCaptureRescue.retryHeld({ isOnline: () => false, commit: async () => undefined, sendDirect: async () => undefined });

  beforeEach(() => {
    capture.settle.mockResolvedValue(true);
    capture.retry.mockReset();
  });
  afterEach(async () => {
    await clearHeld();
  });

  it('a refusal during the session disables the shutter and says why in the hint', async () => {
    const { media } = cameraStream();
    useStream(media);
    renderCamera();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    await screen.findByRole('dialog', { name: 'Câmera' });
    expect(screen.getByRole('button', { name: 'Disparar' })).toBeEnabled();
    await holdOne();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disparar' })).toBeDisabled());
    expect(camera().querySelector('.cam-hint')).toHaveTextContent('Sem espaço para guardar outra foto neste aparelho. Feche a câmera e sincronize para liberar espaço.');
    // "Concluir fotos" still closes the view.
    expect(screen.getByRole('button', { name: 'Concluir fotos' })).toBeEnabled();
    await clearHeld();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disparar' })).toBeEnabled());
  });

  it('the live opener retries the held shot first: still refused, no camera and the refusal toast', async () => {
    await holdOne();
    const { media } = cameraStream();
    const getUserMedia = useStream(media);
    capture.retry.mockResolvedValueOnce(1);
    renderCamera();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    expect(await screen.findByText(/Este aparelho recusou guardar a foto/)).toBeVisible();
    expect(capture.retry).toHaveBeenCalledTimes(1);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Câmera' })).toBeNull();
  });

  it('the live opener opens normally once the retry stored the held shot', async () => {
    await holdOne();
    const { media } = cameraStream();
    const getUserMedia = useStream(media);
    capture.retry.mockImplementationOnce(async () => clearHeld());
    renderCamera();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    expect(await screen.findByRole('dialog', { name: 'Câmera' })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Disparar' })).toBeEnabled();
  });

  it('after the retry cleared the refusal, a device with no camera says the shot failed instead of a picker the browser would block', async () => {
    await holdOne();
    const getUserMedia = vi.fn(async () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError')));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click');
    capture.retry.mockImplementationOnce(async () => clearHeld());
    renderCamera();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    expect(await screen.findByText('Não foi possível salvar a foto. Tente de novo.')).toBeVisible();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(picker).not.toHaveBeenCalled();
  });

  it('the system-camera fallback opens no picker while refused: the toast, and the retry behind it', async () => {
    await holdOne();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click');
    capture.retry.mockResolvedValueOnce(1);
    renderCamera(true);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir câmera' }));
    expect(await screen.findByText(/Este aparelho recusou guardar a foto/)).toBeVisible();
    expect(picker).not.toHaveBeenCalled();
    expect(capture.retry).toHaveBeenCalledTimes(1);
  });
});
