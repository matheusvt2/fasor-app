import type { RelatorioSnapshot } from '@app/domain';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoTile } from '../../db/photo-store.ts';
import { SheetPhotosSection } from './sheet-photos-section.tsx';

/*
 * 11.11-UNIT: "Fotos da ficha" (`60-ficha.html` 779-795). The rows are the kernel's list of
 * the block's live photos (`photosOfBlock`) in capture order, numbered over the whole
 * relatório (`numberPhotos`); the device tiles only add the thumb and the local upload error,
 * joined by id. A block with no live photo renders nothing.
 */

const BLOCK = '019966b0-0111-7000-8000-000000000001';
const OTHER = '019966b0-0111-7000-8000-000000000002';
const id = (n: number) => `019966b0-0111-7000-8000-0000000001${String(n).padStart(2, '0')}`;

function photo(n: number, capturedAt: string, blockId: string | null, extra: Record<string, unknown> = {}) {
  return {
    id: id(n),
    kind: 'photo' as const,
    block_id: blockId,
    item_key: null,
    caption: `Legenda ${n}`,
    captured_at: capturedAt,
    local_seq: n,
    coords: null,
    uploaded_at: null,
    removed_at: null,
    ...extra,
  };
}

function tile(n: number, extra: Partial<PhotoTile> = {}): PhotoTile {
  return {
    id: id(n),
    block_id: null,
    item_key: null,
    caption: null,
    captured_at: '2026-09-06T10:00:00.000Z',
    local_seq: n,
    coords: null,
    uploaded_at: null,
    thumb: null,
    upload_error: null,
    reading_kind: null,
    reading_status: 'none',
    reading_status_op_id: null,
    ...extra,
  };
}

const snapshotOf = (files: unknown[]) => ({ files }) as unknown as RelatorioSnapshot;

afterEach(cleanup);

describe('11.11-UNIT-003 SheetPhotosSection', () => {
  it('lists the block\'s live photos in capture order with the relatório numbers, stamps, captions and pills', async () => {
    const files = [
      photo(1, '2026-09-06T12:00:00.000Z', BLOCK, { uploaded_at: '2026-09-06T12:05:00.000Z' }),
      photo(2, '2026-09-06T09:00:00.000Z', OTHER),
      photo(3, '2026-09-06T10:00:00.000Z', BLOCK, { reading_kind: 'plate', caption: 'Placa de identificação' }),
      photo(4, '2026-09-06T11:00:00.000Z', BLOCK, { coords: { lat: -23.55, lng: -46.63, accuracy_m: null, source: 'exif' } }),
      photo(5, '2026-09-06T08:00:00.000Z', BLOCK, { removed_at: '2026-09-07T00:00:00.000Z' }),
    ];
    const onOpen = vi.fn();
    const onRetry = vi.fn();
    const { container } = render(
      <SheetPhotosSection
        snapshot={snapshotOf(files)}
        blockId={BLOCK}
        tiles={[tile(1), tile(2), tile(4, { upload_error: { state: 'dead', code: 'file_too_large' } as PhotoTile['upload_error'] }), tile(3)]}
        onOpen={onOpen}
        onRetry={onRetry}
      />,
    );
    const section = screen.getByRole('region', { name: 'Fotos da ficha (3)' });
    expect(within(section).getByText('A câmera está na barra (botão Foto). A legenda é escrita do contexto — equipamento, local e a seção na tela; “Legendar” só para mudar.')).toBeInTheDocument();

    // Photo 2 is another sheet's (number 1); the removed photo has no number.
    const rows = [...container.querySelectorAll('.photo-list > .photo-row')];
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.querySelector('.number-badge')?.textContent)).toEqual(['2', '3', '4']);
    expect(rows.map((row) => row.querySelector('.photo-meta')?.textContent)).toEqual(['Placa de identificação', 'Legenda 4', 'Legenda 1']);
    expect(within(rows[1] as HTMLElement).getByText('GPS')).toBeInTheDocument();
    // Pills: waiting, the device's local error, none once the server holds it.
    expect(rows[0]!.querySelector('.upload-pill')?.textContent).toBe('Aguardando envio');
    expect(rows[1]!.querySelector('.upload-pill')?.textContent).toBe('Erro — Tentar novamente');
    expect(rows[2]!.querySelector('.upload-pill')).toBeNull();
    // No "Legendar" in the strip (the viewer edits the caption).
    expect(within(section).queryByRole('button', { name: 'Legendar' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Foto 3, abrir' }));
    expect(onOpen).toHaveBeenCalledWith(id(4));
    await userEvent.click(within(section).getByRole('button', { name: 'Erro — Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledWith(id(4));
  });

  it('draws a kernel row even before the device tile query has it (no thumb, the pill from the row)', () => {
    const { container } = render(
      <SheetPhotosSection snapshot={snapshotOf([photo(1, '2026-09-06T10:00:00.000Z', BLOCK)])} blockId={BLOCK} tiles={[]} onOpen={() => {}} onRetry={() => {}} />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Fotos da ficha (1)' })).toBeInTheDocument();
    expect(container.querySelectorAll('.photo-row')).toHaveLength(1);
    expect(container.querySelector('.thumb-fake')).not.toBeNull();
  });

  it('renders nothing for a block with no live photo', () => {
    const files = [photo(1, '2026-09-06T10:00:00.000Z', OTHER), photo(2, '2026-09-06T11:00:00.000Z', BLOCK, { removed_at: '2026-09-07T00:00:00.000Z' })];
    const { container } = render(<SheetPhotosSection snapshot={snapshotOf(files)} blockId={BLOCK} tiles={[tile(1), tile(2)]} onOpen={() => {}} onRetry={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
