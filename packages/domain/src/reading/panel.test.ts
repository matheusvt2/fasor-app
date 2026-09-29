import { describe, expect, it } from 'vitest';
import type { OcrReadResult, StructuringValue } from '../contract/ocr.ts';
import { buildPanelSuggestion, PANEL_FIELDS, panelColumnOf, panelReadingTarget, panelReadingTargetSchema, panelSuggestionValueSchema } from './panel.ts';

const RELATORIO = '019966b0-0009-7000-8000-000000000001';
const PHOTO = '019966b0-0009-7000-8000-000000000002';
const RUN = '019966b0-0009-7000-8000-000000000003';
const LOCATION = '019966b0-0009-7000-8000-000000000004';
const SUG = '019966b0-0009-7000-8000-000000000005';

const ocr: OcrReadResult = {
  image: { width: 1000, height: 500 },
  tokens: [
    { id: 't0', text: 'C09', bbox: [100, 50, 200, 100], confidence: 0.99 },
    { id: 't1', text: 'SECCIONADORA', bbox: [300, 200, 700, 260], confidence: 0.99 },
  ],
  preprocessing_applied: false,
};

const value = (key: string, text: string, ids: string[], confidence = 0.95): StructuringValue => ({ key, value: text, ocr_token_ids: ids, confidence });

const build = (values: StructuringValue[]) =>
  buildPanelSuggestion({ relatorioId: RELATORIO, photoId: PHOTO, runId: RUN, ocr, image: ocr.image, output: { values }, promptVersion: 'fake-1', newId: () => SUG });

describe('9.2-UNIT panel reading', () => {
  it('targets the palette location and asks for the type and the column', () => {
    expect(panelReadingTarget(LOCATION)).toEqual({ location_id: LOCATION });
    expect(panelReadingTargetSchema.safeParse({ block_id: LOCATION }).success).toBe(false);
    expect(PANEL_FIELDS.map((field) => field.key)).toEqual(['block_type', 'column']);
    expect(PANEL_FIELDS[0]!.options).toHaveLength(8);
  });

  it('reads the first integer 1-99 of a column label', () => {
    expect(panelColumnOf('C09')).toBe(9);
    expect(panelColumnOf('9')).toBe(9);
    expect(panelColumnOf('Coluna 9')).toBe(9);
    expect(panelColumnOf('C0')).toBeNull();
    expect(panelColumnOf('coluna')).toBeNull();
    expect(panelColumnOf('C120 / 12')).toBe(12);
  });

  it('emits one suggested row on file/{photo}/block_id with the type, the column, the union box and the cited tokens', () => {
    const built = build([value('block_type', 'chave_seccionadora', ['t1'], 0.93), value('column', 'C09', ['t0'], 0.95)]);
    expect(built.dropped).toEqual([]);
    expect(built.rows).toHaveLength(1);
    const row = built.rows[0]!;
    expect(row).toMatchObject({
      id: SUG,
      relatorio_id: RELATORIO,
      target_path: `file/${PHOTO}/block_id`,
      value: { block_type: 'chave_seccionadora', column: 9, column_text: 'C09' },
      trust: 'suggested',
      mode: 'fill',
      status: 'pending',
      hint: null,
      source: { photo_id: PHOTO, bbox: [0.1, 0.1, 0.7, 0.52], ocr_token_ids: ['t0', 't1'], reading_run_id: RUN },
    });
    expect(panelSuggestionValueSchema.parse(row.value)).toEqual({ block_type: 'chave_seccionadora', column: 9, column_text: 'C09' });
  });

  it('flags the row Verificar when a kept value is under the confidence floor', () => {
    expect(build([value('block_type', 'chave_seccionadora', ['t1'], 0.4), value('column', 'C09', ['t0'])]).rows[0]!.trust).toBe('verify');
  });

  it('keeps the column alone when the type is not one of the eight', () => {
    const built = build([value('block_type', 'religador', ['t1']), value('column', 'C09', ['t0'])]);
    expect(built.rows[0]!.value).toEqual({ block_type: null, column: 9, column_text: 'C09' });
    expect(built.rows[0]!.source.ocr_token_ids).toEqual(['t0']);
    expect(built.dropped).toEqual([{ key: 'block_type', reason: 'unknown_type' }]);
  });

  it('emits nothing when neither the type nor the column was read, and drops unknown keys and tokens', () => {
    expect(build([]).rows).toEqual([]);
    const built = build([value('tag', 'SEC', ['t1']), value('block_type', 'tp', ['t9']), value('column', 'coluna', ['t0'])]);
    expect(built.rows).toEqual([]);
    expect(built.dropped).toEqual([
      { key: 'tag', reason: 'unknown_key' },
      { key: 'block_type', reason: 'unknown_token' },
      { key: 'column', reason: 'no_column' },
    ]);
  });
});
