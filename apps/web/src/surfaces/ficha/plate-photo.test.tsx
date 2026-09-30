import { padCropToAspect, PLATE_FOCUS_MARGIN, plateCropView, regionWithin } from '@app/domain';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoTile } from '../../db/photo-store.ts';
import { AiFeaturesContext } from '../../state/ai-features.tsx';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { PlateCameraGroup, PlateCrop, PlatePhotoRow } from './plate-photo.tsx';

/*
 * 8.2/8.6-UNIT: the plate photo above the nameplate, state by state (`60-ficha.html`): the tile
 * with the chips before any plate photo; the photo row with "Foto guardada — leitura quando
 * houver sinal", "Lendo…", or "Não foi possível ler" with "Tentar novamente" (the reread
 * route, disabled offline, a refused answer said in a toast) and "Preencher manualmente";
 * nothing under a done reading; and the plate crop with the focused field's one region.
 */

const session = { database: null, user: null, online: true };
vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));
/** E78-Q14: the picture the plate crop draws; null (the placeholder) unless a test sets it. */
const cropSource: { blob: Blob | null } = { blob: null };
vi.mock('../../components/crop-thumb.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/crop-thumb.tsx')>()),
  useCropSource: () => cropSource.blob,
}));

const PHOTO = '019966b0-0088-7000-8000-000000000001';

const tile = (extra: Partial<PhotoTile> = {}): PhotoTile => ({
  id: PHOTO,
  block_id: '019966b0-0088-7000-8000-000000000002',
  item_key: null,
  caption: 'placa de identificação',
  captured_at: '2026-09-06T13:20:00.000Z',
  local_seq: 3,
  coords: null,
  uploaded_at: null,
  thumb: null,
  upload_error: null,
  reading_kind: 'plate',
  reading_status: 'queued',
  reading_status_op_id: null,
  ...extra,
});

/** "Tentar novamente" once its recorded press has been read (E9 sweep B16: disabled until then). */
async function enabledRetry(): Promise<HTMLElement> {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Tentar novamente' })).not.toHaveAttribute('aria-disabled'));
  return screen.getByRole('button', { name: 'Tentar novamente' });
}

function wrap(children: ReactNode, sync: SyncState = makeSyncState()) {
  return render(
    <SyncContext value={sync}>
      <ToastProvider>
        {children}
        <ToastOutlet />
      </ToastProvider>
    </SyncContext>,
  );
}

afterEach(() => {
  cleanup();
  session.online = true;
});

describe('8.2-UNIT the plate photo row', () => {
  it('queued: the tile with its number, the caption, the meta and "Foto guardada — leitura quando houver sinal"', async () => {
    const onOpen = vi.fn();
    const { container } = wrap(<PlatePhotoRow tile={tile()} number={3} view="queued" onOpen={onOpen} onFillManually={vi.fn()} />);
    expect(container.querySelector('.photo-row.ficha-np-photo .photo-tile .number-badge')).toHaveTextContent('3');
    expect(container.querySelector('.photo-caption')).toHaveTextContent('placa de identificação');
    expect(container.querySelector('.photo-meta')?.textContent).toMatch(/^Nº provisório 3 · /);
    expect(container.querySelector('.queued-banner')).toHaveTextContent('Foto guardada — leitura quando houver sinal');
    expect(container.querySelector('.reading-line')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Foto 3, placa — abrir' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('running: "Lendo…" instead of the queued line', () => {
    const { container } = wrap(<PlatePhotoRow tile={tile({ reading_status: 'running' })} number={3} view="running" onOpen={vi.fn()} onFillManually={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Lendo…');
    expect(container.querySelector('.queued-banner')).toBeNull();
  });

  it('done: the row and its meta, no reading line', () => {
    const { container } = wrap(<PlatePhotoRow tile={tile({ reading_status: 'done' })} number={null} view="done" onOpen={vi.fn()} onFillManually={vi.fn()} />);
    expect(container.querySelector('.photo-row')).not.toBeNull();
    expect(container.querySelector('.reading-line, .queued-banner')).toBeNull();
    expect(screen.getByRole('button', { name: 'Foto da placa — abrir' })).toBeInTheDocument();
  });

  it('failed: "Tentar novamente" asks for the reread, and "Preencher manualmente" hands over to the fields', async () => {
    const sync = makeSyncState();
    const fill = vi.fn();
    wrap(<PlatePhotoRow tile={tile({ reading_status: 'failed' })} number={3} view="failed" onOpen={vi.fn()} onFillManually={fill} />, sync);
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível ler');
    await userEvent.click(await enabledRetry());
    expect(sync.rereadPhoto).toHaveBeenCalledWith(PHOTO);
    await userEvent.click(screen.getByRole('button', { name: 'Preencher manualmente' }));
    expect(fill).toHaveBeenCalledOnce();
  });

  it('E78-Q5: from the tap "Tentar novamente" stays disabled, a second tap sends nothing, until the next status op', async () => {
    const sync = makeSyncState();
    const failed = (opId: string | null) => (
      <PlatePhotoRow tile={tile({ reading_status: 'failed', reading_status_op_id: opId })} number={3} view="failed" onOpen={vi.fn()} onFillManually={vi.fn()} />
    );
    const { rerender } = wrap(failed('019966b0-0088-7000-8000-0000000000a1'), sync);
    await userEvent.click(await enabledRetry());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveAttribute('aria-disabled', 'true'));
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(sync.rereadPhoto).toHaveBeenCalledOnce();
    // The same status op (a pull that did not move it): still waiting.
    rerender(
      <SyncContext value={sync}>
        <ToastProvider>{failed('019966b0-0088-7000-8000-0000000000a1')}</ToastProvider>
      </SyncContext>,
    );
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveAttribute('aria-disabled', 'true');
    // A new `failed` written over `failed`: the button is back.
    rerender(
      <SyncContext value={sync}>
        <ToastProvider>{failed('019966b0-0088-7000-8000-0000000000a2')}</ToastProvider>
      </SyncContext>,
    );
    await enabledRetry();
  });

  it('failed: a refused reread says so in a toast and the button comes back; offline the button waits with its reason', async () => {
    const sync = makeSyncState({ rereadPhoto: vi.fn(async () => Promise.reject(new Error('503'))) });
    wrap(<PlatePhotoRow tile={tile({ reading_status: 'failed' })} number={3} view="failed" onOpen={vi.fn()} onFillManually={vi.fn()} />, sync);
    await userEvent.click(await enabledRetry());
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Não foi possível pedir a nova leitura'));
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).not.toHaveAttribute('aria-disabled');
    cleanup();

    session.online = false;
    const offline = makeSyncState();
    wrap(<PlatePhotoRow tile={tile({ reading_status: 'failed' })} number={3} view="failed" onOpen={vi.fn()} onFillManually={vi.fn()} />, offline);
    const retry = screen.getByRole('button', { name: 'Tentar novamente' });
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    expect(retry).toHaveAccessibleDescription('Sem conexão');
    await userEvent.click(retry);
    expect(offline.rereadPhoto).not.toHaveBeenCalled();
  });
});

describe('11.8 follow-up: a failed plate reading while the server AI features are off', () => {
  it('offers only "Preencher manualmente", no "Tentar novamente"', async () => {
    const fill = vi.fn();
    wrap(
      <AiFeaturesContext value={false}>
        <PlatePhotoRow tile={tile({ reading_status: 'failed' })} number={3} view="failed" onOpen={vi.fn()} onFillManually={fill} />
      </AiFeaturesContext>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível ler');
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Preencher manualmente' }));
    expect(fill).toHaveBeenCalledOnce();
  });
});

describe('8.2-UNIT the plate photo row on a read-only sheet', () => {
  it('says the reading failed without offering its actions', () => {
    wrap(<PlatePhotoRow tile={tile({ reading_status: 'failed' })} number={3} view="failed" onOpen={vi.fn()} onFillManually={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível ler');
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preencher manualmente' })).toBeNull();
  });
});

describe('8.2-UNIT the empty plate', () => {
  it('draws the copy chips first, then the "Fotografar placa" tile, with no "Digitar"', () => {
    const { container } = wrap(
      <PlateCameraGroup
        relatorioId={PHOTO}
        target={() => ({ blockId: null, itemKey: null, caption: null })}
        chips={
          <div className="chip-row" data-testid="chips">
            chips
          </div>
        }
      />,
    );
    const group = container.querySelector('.camera-group')!;
    // (The camera's hidden system-camera input sits after them.)
    expect([...group.children].filter((child) => !(child instanceof HTMLInputElement)).map((child) => child.className)).toEqual(['chip-row', 'camera-capture-tile']);
    expect(screen.getByRole('button', { name: 'Fotografar placa' })).toHaveClass('camera-capture-tile');
    expect(screen.queryByText('Digitar')).toBeNull();
  });
});

describe('8.6-UNIT the plate crop', () => {
  it('is one image named for what it shows, outlines only the focused field and opens the viewer', async () => {
    const onOpen = vi.fn();
    const { container, rerender } = wrap(<PlateCrop photoId={PHOTO} region={[0.2, 0.2, 0.6, 0.6]} focused={null} onOpen={onOpen} />);
    expect(screen.getByRole('img', { name: 'Recorte da placa lida — as regiões marcam os campos sugeridos' })).toHaveClass('plate-crop');
    expect(container.querySelector('.plate-crop .thumb-fake')).not.toBeNull();
    expect(container.querySelectorAll('.plate-crop .region')).toHaveLength(0);
    rerender(
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <PlateCrop photoId={PHOTO} region={[0.2, 0.2, 0.6, 0.6]} focused={[0.3, 0.4, 0.5, 0.5]} onOpen={onOpen} />
        </ToastProvider>
      </SyncContext>,
    );
    const regions = container.querySelectorAll<HTMLElement>('.plate-crop .region');
    expect(regions).toHaveLength(1);
    // E78-R1: the crop zooms to the focused field with the kernel's margin, so the outline
    // sits inside the view with that margin around it on every side.
    const zoomed = plateCropView([0.2, 0.2, 0.6, 0.6], [0.3, 0.4, 0.5, 0.5], null, 0);
    expect(zoomed).toEqual([0.3 - PLATE_FOCUS_MARGIN, 0.4 - PLATE_FOCUS_MARGIN, 0.5 + PLATE_FOCUS_MARGIN, 0.5 + PLATE_FOCUS_MARGIN]);
    const outline = regionWithin(zoomed, [0.3, 0.4, 0.5, 0.5]);
    const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`;
    expect(regions[0]!.style.left).toBe(pct(outline.left));
    expect(regions[0]!.style.top).toBe(pct(outline.top));
    expect(outline.left).toBeGreaterThan(0);
    expect(outline.left + outline.width).toBeLessThan(100);
    await userEvent.click(container.querySelector('.plate-crop-open')!);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe('E78-Q14 the plate crop widened to the box', () => {
  afterEach(() => {
    cropSource.blob = null;
    vi.unstubAllGlobals();
  });

  it('once the picture loads, a tall narrow region is padded to the box aspect: the picture and the outline follow the padded region', async () => {
    cropSource.blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    vi.stubGlobal('URL', Object.assign(Object.create(URL) as typeof URL, { createObjectURL: () => 'blob:plate', revokeObjectURL: () => undefined }));
    const region = [0.45, 0.4, 0.55, 0.6] as const;
    const focused = [0.47, 0.45, 0.53, 0.5] as const;
    const { container } = wrap(<PlateCrop photoId={PHOTO} region={region} focused={focused} onOpen={vi.fn()} />);
    const img = await waitFor(() => {
      const found = container.querySelector<HTMLImageElement>('.plate-crop-view img');
      expect(found).not.toBeNull();
      return found!;
    });
    const box = container.querySelector<HTMLElement>('.plate-crop')!;
    Object.defineProperty(box, 'clientWidth', { value: 670 });
    Object.defineProperty(box, 'clientHeight', { value: 160 });
    Object.defineProperty(img, 'naturalWidth', { value: 1600 });
    Object.defineProperty(img, 'naturalHeight', { value: 1100 });
    fireEvent.load(img);

    // E78-R1: zoomed to the focused field (with its margin), then padded to the box aspect.
    const shown = plateCropView(region, focused, { width: 1600, height: 1100 }, 670 / 160);
    expect(shown).toEqual(padCropToAspect(plateCropView(region, focused, null, 0), { width: 1600, height: 1100 }, 670 / 160));
    // Widened to the box's own aspect (it was a tall narrow region).
    expect(((shown[2] - shown[0]) * 1600) / ((shown[3] - shown[1]) * 1100)).toBeCloseTo(670 / 160, 5);
    const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`;
    const w = shown[2] - shown[0];
    await waitFor(() => expect(img.style.width).toBe(pct(100 / w)));
    expect(img.hidden).toBe(false);
    expect(img.style.left).toBe(pct((-shown[0] / w) * 100));
    // Not the unpadded region's (1000 % wide).
    expect(img.style.width).not.toBe(pct(100 / (region[2] - region[0])));
    // With no field focused the crop shows the whole read region, padded the same way.
    expect(plateCropView(region, null, { width: 1600, height: 1100 }, 670 / 160)).toEqual(padCropToAspect(region, { width: 1600, height: 1100 }, 670 / 160));
    const outline = regionWithin(shown, focused);
    const drawn = container.querySelector<HTMLElement>('.plate-crop .region')!;
    expect(drawn.style.left).toBe(pct(outline.left));
    expect(drawn.style.width).toBe(pct(outline.width));
  });
});
