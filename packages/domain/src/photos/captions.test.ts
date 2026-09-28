import { describe, expect, it } from 'vitest';
import { fileFieldPath, sheetChecklistPath } from '../ops/path.ts';
import { emptySheet, suggestionRowSchema, type BlockRow, type Cell, type SuggestionRow } from '../schemas/entities.ts';
import { TEST_COMPANY, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import {
  captionConfirmAllOps,
  captionConfirmAnnouncement,
  captionDiscardOps,
  captionSuggestionPhotoId,
  captionSuggestions,
  captionUsarAnnouncement,
  legendaConfirmadaText,
  legendasConfirmadasText,
  legendasSugeridasText,
  ncDraftFor,
  ncDraftTarget,
  ncDraftUsarAnnouncement,
  staleProseSuggestions,
  type CaptionPhotoLike,
} from './captions.ts';
import { galleryCounterText, galleryCounts, photoTileLabel } from './gallery.ts';

/*
 * 9.3/9.5-UNIT: which prose suggestion the device shows (a tile's caption, an NC row's
 * draft), which ones are stale, the batch ops and the texts.
 */

const id = (n: number) => `019966b0-0096-7000-8000-${n.toString(16).padStart(12, '0')}`;
const AUTHOR = { id: TEST_USER, companyId: TEST_COMPANY };
const BLOCK = id(1);
const RUN = id(2);
const OP = id(3);
const P1 = id(11);
const P2 = id(12);
const P3 = id(13);

let seq = 0x100;
function suggestion(targetPath: string, value: string, photoId: string, extra: Partial<SuggestionRow> = {}): SuggestionRow {
  return suggestionRowSchema.parse({
    id: id(++seq),
    relatorio_id: TEST_RELATORIO,
    target_path: targetPath,
    value,
    trust: 'suggested',
    mode: 'fill',
    source: { photo_id: photoId, bbox: [0, 0, 1, 1], ocr_token_ids: [], reading_run_id: RUN },
    status: 'pending',
    prompt_version: 'fake-1',
    ...extra,
  });
}

const photo = (photoId: string, extra: Partial<CaptionPhotoLike> = {}): CaptionPhotoLike => ({ id: photoId, block_id: null, caption: null, people_in_photo: false, removed_at: null, ...extra });
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });

function block(checklist: BlockRow['sheet']['checklist'], removed: string | null = null): BlockRow {
  return {
    id: BLOCK,
    relatorio_id: TEST_RELATORIO,
    location_id: id(4),
    equipment_id: null,
    block_type: 'chave_seccionadora',
    config: {},
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), checklist },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: removed,
  };
}

describe('9.3-UNIT-004 caption suggestions on the gallery', () => {
  it('the newest pending caption of a live photo with no sheet, no caption and no mark', () => {
    const old = suggestion(fileFieldPath(P1, 'caption'), 'Antiga', P1);
    const newest = suggestion(fileFieldPath(P1, 'caption'), 'Vista geral', P1);
    const confirmed = suggestion(fileFieldPath(P2, 'caption'), 'Feita', P2, { status: 'confirmed' });
    const shown = captionSuggestions([photo(P1), photo(P2)], [old, newest, confirmed]);
    expect([...shown.entries()]).toEqual([[P1, newest]]);
    expect(captionSuggestionPhotoId(newest)).toBe(P1);
    expect(captionSuggestionPhotoId(suggestion(sheetChecklistPath(BLOCK, 'contatos', 'observation'), 'x', P1))).toBeNull();
  });

  it('a mark, a caption, a sheet, a removal or an unknown photo shows nothing, and those rows are stale', () => {
    const rows = [P1, P2, P3, id(14), id(15)].map((p) => suggestion(fileFieldPath(p, 'caption'), 'Vista', p));
    const photos = [
      photo(P1, { people_in_photo: true }),
      photo(P2, { caption: 'Detalhe' }),
      photo(P3, { block_id: BLOCK }),
      photo(id(14), { removed_at: '2026-09-28T10:00:00.000Z' }),
    ];
    expect(captionSuggestions(photos, rows).size).toBe(0);
    expect(staleProseSuggestions({ photos, blocks: [], pending: rows })).toEqual(rows);
    expect(staleProseSuggestions({ photos: [photo(P1)], blocks: [], pending: [rows[0]!] })).toEqual([]);
  });

  it('Confirmar todas is every confirm pair; a typed caption or a mark discards the photo pending captions', () => {
    const a = suggestion(fileFieldPath(P1, 'caption'), 'Vista A', P1);
    const b = suggestion(fileFieldPath(P2, 'caption'), 'Vista B', P2);
    const ops = captionConfirmAllOps(AUTHOR, [a, b]);
    expect(ops.map((op) => [op.path, op.value, op.meta])).toEqual([
      [`suggestion/${a.id}/status`, 'confirmed', null],
      [`file/${P1}/caption`, 'Vista A', { source_suggestion_id: a.id }],
      [`suggestion/${b.id}/status`, 'confirmed', null],
      [`file/${P2}/caption`, 'Vista B', { source_suggestion_id: b.id }],
    ]);
    expect(captionDiscardOps(AUTHOR, P1, [a, b]).map((op) => [op.path, op.value])).toEqual([[`suggestion/${a.id}/status`, 'discarded']]);
  });

  it('the gallery counts a shown suggestion as suggested, not as uncaptioned; the counter and the tile say so', () => {
    const counts = galleryCounts(
      [
        { id: P1, uploaded_at: 'x', caption: null },
        { id: P2, uploaded_at: 'x', caption: null },
      ],
      new Set([P1]),
    );
    expect(counts).toEqual({ pending: 0, error: 0, uncaptioned: 1, suggested: 1 });
    expect(galleryCounterText({ pending: 1, error: 1, uncaptioned: 1, suggested: 12 })).toBe('1 foto aguardando envio · 1 com erro · 12 legendas sugeridas · 1 sem legenda');
    expect(photoTileLabel(1, { suggested: true })).toBe('Foto 1, legenda sugerida, abrir');
    expect(photoTileLabel(1)).toBe('Foto 1, abrir');
  });

  it('texts', () => {
    expect(legendasSugeridasText(1)).toBe('1 legenda sugerida');
    expect(legendasSugeridasText(12)).toBe('12 legendas sugeridas');
    expect(legendasConfirmadasText(1)).toBe('1 legenda confirmada');
    expect(legendasConfirmadasText(3)).toBe('3 legendas confirmadas');
    expect(legendaConfirmadaText(4)).toBe('Legenda da foto 4 confirmada');
    expect(legendaConfirmadaText(null)).toBe('Legenda confirmada');
    expect(captionConfirmAnnouncement('Vista')).toBe('Sugerido, Vista, confirmar');
    expect(captionUsarAnnouncement('Vista')).toBe('Usar a legenda sugerida: Vista');
    expect(ncDraftUsarAnnouncement(8)).toBe('Usar o rascunho da observação do item 8');
  });
});

describe('9.5-UNIT-002 the NC draft on its row', () => {
  const path = sheetChecklistPath(BLOCK, 'contatos', 'observation');

  it('shows the newest pending draft while the row is NC with a blank observation', () => {
    const old = suggestion(path, 'Antiga.', P1);
    const draft = suggestion(path, 'Oxidação aparente.', P1);
    const other = suggestion(sheetChecklistPath(BLOCK, 'isoladores', 'observation'), 'Outro.', P2);
    const nc = block({ contatos: { result: cell('NC') } });
    expect(ncDraftFor(nc, 'contatos', [old, draft, other])).toBe(draft);
    expect(ncDraftTarget(draft)).toEqual({ blockId: BLOCK, itemKey: 'contatos' });
    expect(staleProseSuggestions({ photos: [], blocks: [nc], pending: [draft] })).toEqual([]);
  });

  it('a C row, a cleared row, a typed observation or a removed block: no draft, and it is stale', () => {
    const draft = suggestion(path, 'Oxidação aparente.', P1);
    for (const b of [
      block({ contatos: { result: cell('C') } }),
      block({}),
      block({ contatos: { result: cell('NC'), observation: cell('Digitado') } }),
    ]) {
      expect(ncDraftFor(b, 'contatos', [draft])).toBeNull();
      expect(staleProseSuggestions({ photos: [], blocks: [b], pending: [draft] })).toEqual([draft]);
    }
    expect(staleProseSuggestions({ photos: [], blocks: [block({ contatos: { result: cell('NC') } }, '2026-09-28T10:00:00.000Z')], pending: [draft] })).toEqual([draft]);
    expect(staleProseSuggestions({ photos: [], blocks: [], pending: [draft] })).toEqual([draft]);
  });

  it('a nameplate or measurement suggestion is never prose, never stale here', () => {
    const plate = suggestion(`sheet/${BLOCK}/nameplate/fabricante`, 'WEG', P1);
    expect(staleProseSuggestions({ photos: [], blocks: [], pending: [plate] })).toEqual([]);
  });
});
