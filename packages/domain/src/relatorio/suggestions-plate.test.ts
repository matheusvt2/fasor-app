import { describe, expect, it } from 'vitest';
import { emptySheet, suggestionRowSchema, type BlockRow, type Cell, type SuggestionRow } from '../schemas/entities.ts';
import { TEST_RELATORIO } from '../test-support.ts';
import {
  arrivedReadingsCount,
  singleSourcePhotoId,
  confirmAllCandidates,
  criarText,
  hasCreateHint,
  leiturasNaFilaText,
  leiturasProntasText,
  PLATE_CAPTION,
  plateCropRegion,
  platePhotoOf,
  plateReadingView,
  regionWithin,
  sugestoesProntasBannerText,
  suggestionGroupCounts,
  suggestionGroupNoteText,
  unknownManufacturer,
} from './suggestions.ts';

/*
 * 8.2/8.6-UNIT: the plate photo and the confirm-in-one-tap rules of the kernel -- which photo
 * is the sheet's plate, where its reading stands, the crop region and the focused field's
 * outline inside it, the create hint ("Criar Celtta?") kept out of "Confirmar todos", the
 * typed unknown manufacturer, and the texts of the arrival toast, the banner and Sync status.
 */

const BLOCK = '019966b0-0087-7000-8000-000000000001';
const LOC = '019966b0-0087-7000-8000-000000000003';
const PHOTO = '019966b0-0087-7000-8000-000000000004';
const OTHER_PHOTO = '019966b0-0087-7000-8000-000000000005';
const RUN = '019966b0-0087-7000-8000-000000000006';
const RUN_2 = '019966b0-0087-7000-8000-000000000007';
const OP = '019966b0-0087-7000-8000-000000000008';

let seq = 0x200;
const sid = () => `019966b0-0087-7000-8000-${(++seq).toString(16).padStart(12, '0')}`;

function suggestion(field: string, value: unknown, extra: Partial<SuggestionRow> = {}): SuggestionRow {
  return suggestionRowSchema.parse({
    id: sid(),
    relatorio_id: TEST_RELATORIO,
    target_path: `sheet/${BLOCK}/nameplate/${field}`,
    value,
    trust: 'suggested',
    mode: 'fill',
    source: { photo_id: PHOTO, bbox: [0.1, 0.2, 0.3, 0.4], ocr_token_ids: ['t0'], reading_run_id: RUN },
    status: 'pending',
    prompt_version: 'test-1',
    ...extra,
  });
}

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });

function transformer(nameplate: Record<string, Cell> = {}): BlockRow {
  return {
    id: BLOCK,
    relatorio_id: TEST_RELATORIO,
    location_id: LOC,
    equipment_id: null,
    block_type: 'transformador_forca',
    config: {},
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), nameplate },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

const photo = (id: string, extra: Partial<{ block_id: string | null; reading_kind: 'plate' | 'display' | null; local_seq: number; captured_at: string; removed_at: string | null }> = {}) => ({
  id,
  block_id: BLOCK,
  reading_kind: 'plate' as 'plate' | 'display' | null,
  local_seq: 1,
  captured_at: '2026-09-27T10:00:00.000Z',
  removed_at: null as string | null,
  ...extra,
});

const celtta = () => suggestion('fabricacao', 'Celtta', { hint: { create_registry_entry: { kind: 'manufacturer', name: 'Celtta' } } });

describe('8.2-UNIT the plate photo of a sheet', () => {
  it('is the newest live plate photo of the block, by local_seq then captured_at', () => {
    const older = photo(PHOTO, { local_seq: 1 });
    const newer = photo(OTHER_PHOTO, { local_seq: 2 });
    expect(platePhotoOf([older, newer], BLOCK)?.id).toBe(OTHER_PHOTO);
    const tieLate = photo(OTHER_PHOTO, { local_seq: 1, captured_at: '2026-09-27T11:00:00.000Z' });
    expect(platePhotoOf([older, tieLate], BLOCK)?.id).toBe(OTHER_PHOTO);
    // A removed one, a plain photo, another block's plate: none is this sheet's plate.
    expect(platePhotoOf([photo(PHOTO, { removed_at: '2026-09-27T12:00:00.000Z' })], BLOCK)).toBeNull();
    expect(platePhotoOf([photo(PHOTO, { reading_kind: null })], BLOCK)).toBeNull();
    expect(platePhotoOf([photo(PHOTO, { reading_kind: 'display' })], BLOCK)).toBeNull();
    expect(platePhotoOf([photo(PHOTO, { block_id: 'other' })], BLOCK)).toBeNull();
    expect(PLATE_CAPTION).toBe('placa de identificação');
  });

  it('reads its reading as queued, running, failed, ready or done', () => {
    const p = (reading_status: 'none' | 'queued' | 'running' | 'done' | 'failed') => ({ id: PHOTO, reading_status });
    expect(plateReadingView(p('queued'), [])).toBe('queued');
    expect(plateReadingView(p('running'), [])).toBe('running');
    expect(plateReadingView(p('failed'), [])).toBe('failed');
    expect(plateReadingView(p('done'), [])).toBe('done');
    expect(plateReadingView(p('none'), [])).toBe('done');
    // Ready while any pending suggestion came from it, whatever its stored status.
    const pending = [suggestion('tipo', 'X')];
    expect(plateReadingView(p('done'), pending)).toBe('ready');
    expect(plateReadingView(p('queued'), pending)).toBe('ready');
    // Another photo's suggestion, or one already confirmed, is not this photo's.
    expect(plateReadingView(p('done'), [suggestion('tipo', 'X', { source: { ...pending[0]!.source, photo_id: OTHER_PHOTO } })])).toBe('done');
    expect(plateReadingView(p('done'), [{ ...pending[0]!, status: 'confirmed' }])).toBe('done');
  });

  it('crops the union of the pending bboxes of the photo with a margin, clamped, and outlines a field inside it', () => {
    const a = suggestion('tipo', 'X', { source: { photo_id: PHOTO, bbox: [0.2, 0.3, 0.4, 0.35], ocr_token_ids: [], reading_run_id: RUN } });
    const b = suggestion('tap_atual', '3', { source: { photo_id: PHOTO, bbox: [0.5, 0.6, 0.9, 0.7], ocr_token_ids: [], reading_run_id: RUN } });
    const elsewhere = suggestion('n_serie', 'Y', { source: { photo_id: OTHER_PHOTO, bbox: [0, 0, 1, 1], ocr_token_ids: [], reading_run_id: RUN } });
    const region = plateCropRegion([a, b, elsewhere], PHOTO)!;
    expect(region.map((n) => Number(n.toFixed(4)))).toEqual([0.18, 0.28, 0.92, 0.72]);
    expect(plateCropRegion([a, b], OTHER_PHOTO)).toBeNull();
    // Clamped at the picture's edges.
    const edge = suggestion('tipo', 'X', { source: { photo_id: PHOTO, bbox: [0, 0.99, 0.01, 1], ocr_token_ids: [], reading_run_id: RUN } });
    expect(plateCropRegion([edge], PHOTO)!.map((n) => Number(n.toFixed(4)))).toEqual([0, 0.97, 0.03, 1]);
    const outline = regionWithin([0.2, 0.2, 0.6, 0.6], [0.3, 0.4, 0.5, 0.5]);
    expect(Object.fromEntries(Object.entries(outline).map(([k, v]) => [k, Math.round(v)]))).toEqual({ left: 25, top: 50, width: 50, height: 25 });
    expect(regionWithin([0.2, 0.2, 0.6, 0.6], [0, 0, 1, 1])).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });
});

describe('8.5/8.6-UNIT the create hint and the typed unknown manufacturer', () => {
  const registry = [{ name: 'Schneider', removed_at: null }, { name: 'WEG', removed_at: '2026-09-01T00:00:00.000Z' }];

  it('is a create while the live registry does not hold the name (normalized)', () => {
    expect(hasCreateHint(celtta(), registry)).toBe(true);
    expect(hasCreateHint(celtta(), [{ name: '  CELTTA ', removed_at: null }])).toBe(false);
    expect(hasCreateHint(suggestion('fabricacao', 'Schneider'), registry)).toBe(false);
    expect(criarText('Celtta')).toBe('Criar Celtta?');
  });

  it('keeps a create fill out of Confirmar todos and counts it apart; a known name is a plain fill', () => {
    const block = transformer({ tensao_nominal_at: cell({ raw: '13,8', unit: 'kV', state: 'measured' }) });
    const fab = celtta();
    const tipo = suggestion('tipo', 'TSE-500/15');
    const serie = suggestion('n_serie', '240815-01', { trust: 'verify' });
    const at = suggestion('tensao_nominal_at', { raw: '15', unit: 'kV', state: 'measured' });
    const pending = [fab, tipo, serie, at];
    expect(confirmAllCandidates(block, pending, registry).map((s) => s.id)).toEqual([tipo.id]);
    expect(suggestionGroupCounts(block, pending, registry)).toEqual({ shown: 4, fills: 3, confirmable: 1, verify: 1, create: 1 });
    const known = [...registry, { name: 'Celtta', removed_at: null }];
    expect(confirmAllCandidates(block, pending, known).map((s) => s.id)).toEqual([fab.id, tipo.id]);
    expect(suggestionGroupCounts(block, pending, known)).toMatchObject({ confirmable: 2, create: 0 });
  });

  it('flags a typed manufacturer the registry does not hold, and nothing else', () => {
    expect(unknownManufacturer({ kind: 'manufacturer' }, 'Celtta', registry)).toBe(true);
    expect(unknownManufacturer({ kind: 'manufacturer' }, 'schneider', registry)).toBe(false);
    // A removed row is not a live one.
    expect(unknownManufacturer({ kind: 'manufacturer' }, 'WEG', registry)).toBe(true);
    expect(unknownManufacturer({ kind: 'manufacturer' }, '  ', registry)).toBe(false);
    expect(unknownManufacturer({ kind: 'text' }, 'Celtta', registry)).toBe(false);
  });
});

describe('8.2/8.6-UNIT the texts', () => {
  it('names the photo in the group note when its number is known', () => {
    expect(suggestionGroupNoteText(9, 1, 3)).toBe('9 sugestões lidas da foto 3. Nada foi gravado: confirme um a um ou todos — o campo “Verificar” pede o seu toque.');
    expect(suggestionGroupNoteText(1, 0, 12)).toBe('1 sugestão lida da foto 12. Nada foi gravado até você confirmar.');
    expect(suggestionGroupNoteText(9, 1, null)).toBe('9 sugestões lidas. Nada foi gravado: confirme um a um ou todos — o campo “Verificar” pede o seu toque.');
  });

  it('names the one photo a group was read from, none when several or none', () => {
    const one = [suggestion('tipo', 'A'), suggestion('tap_atual', 'B')];
    expect(singleSourcePhotoId(one)).toBe(PHOTO);
    const other = suggestion('n_serie', 'C', { source: { photo_id: '019966b0-0087-7000-8000-0000000000aa', bbox: [0, 0, 1, 1], ocr_token_ids: [], reading_run_id: RUN_2 } });
    expect(singleSourcePhotoId([...one, other])).toBeNull();
    expect(singleSourcePhotoId([])).toBeNull();
  });

  it('counts the readings that arrived by their runs, and writes the toast, the banner and the queue line', () => {
    const rows = [suggestion('tipo', 'A'), suggestion('tap_atual', 'B'), suggestion('n_serie', 'C', { source: { photo_id: PHOTO, bbox: [0, 0, 1, 1], ocr_token_ids: [], reading_run_id: RUN_2 } })];
    expect(arrivedReadingsCount(rows)).toBe(2);
    expect(arrivedReadingsCount([])).toBe(0);
    expect(leiturasProntasText(3)).toBe('3 leituras prontas para confirmar');
    expect(leiturasProntasText(1)).toBe('1 leitura pronta para confirmar');
    expect(leiturasNaFilaText(2)).toBe('2 leituras na fila');
    expect(leiturasNaFilaText(1)).toBe('1 leitura na fila');
    expect(sugestoesProntasBannerText(9)).toBe('Sugestões prontas — 9 campos para confirmar');
    expect(sugestoesProntasBannerText(1)).toBe('Sugestões prontas — 1 campo para confirmar');
  });
});
