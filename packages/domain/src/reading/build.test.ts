import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ocrReadResultSchema, structuringOutputSchema, type StructuringOutput } from '../contract/ocr.ts';
import type { WordRow } from '../registry/word-row.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { SEED_VERSION } from '../seed/definitions.ts';
import { buildReadingSuggestions, type BuildReadingSuggestionsInput } from './build.ts';

/*
 * Stories 8.4 and 8.5 over the committed fake fixture of the synthetic transformer plate
 * (`apps/api/src/jobs/reading/fixtures/<sha256>.json`, its README holds the table below).
 */

const PLATE_SHA = 'a1eac9106f186a29ca82e896741922794eda7f86a231c4dcf942031d14dc26ac';
const fixturePath = fileURLToPath(new URL(`../../../../apps/api/src/jobs/reading/fixtures/${PLATE_SHA}.json`, import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { outcome: string; ocr: unknown; structuring: unknown };
const ocr = ocrReadResultSchema.parse(fixture.ocr);
const output = structuringOutputSchema.parse(fixture.structuring);

const uuid = (n: number) => `019966b0-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const RELATORIO = uuid(1);
const PHOTO = uuid(2);
const RUN = uuid(3);
const BLOCK = uuid(4);

function counter(start = 100): () => string {
  let n = start;
  return () => uuid(n++);
}

function block(nameplate: Record<string, Cell> = {}, blockType = 'transformador_forca'): BuildReadingSuggestionsInput['block'] {
  return { id: BLOCK, seed_version: SEED_VERSION, block_type: blockType, sheet: { nameplate, checklist: {}, test: {} } as unknown as BlockRow['sheet'] };
}

function input(overrides: Partial<BuildReadingSuggestionsInput> = {}): BuildReadingSuggestionsInput {
  return {
    relatorioId: RELATORIO,
    photoId: PHOTO,
    runId: RUN,
    block: block(),
    ocr,
    image: { width: 1600, height: 1100 },
    output,
    promptVersion: 'fake-1',
    registry: { manufacturers: [], voltageClasses: [] },
    newId: counter(),
    ...overrides,
  };
}

const HINT_CELTTA = { create_registry_entry: { kind: 'manufacturer', name: 'Celtta' } };

/** The README table: field, value emitted, cited tokens, trust, hint. */
const TABLE: [string, unknown, string[], 'suggested' | 'verify', unknown][] = [
  ['identificacao', 'TR-01', ['t4'], 'suggested', null],
  ['fabricacao', 'Celtta', ['t6'], 'suggested', HINT_CELTTA],
  ['n_serie', '240815-07', ['t9'], 'suggested', null],
  ['tipo', 'TSE-500/15', ['t11'], 'suggested', null],
  ['tipo_de_isolacao', 'EPÓXI', ['t15'], 'suggested', null],
  ['potencia_nominal', { raw: '500', unit: 'kVA', state: 'measured' }, ['t22', 't23'], 'suggested', null],
  ['tap_atual', '5', ['t26'], 'verify', null],
  ['data_fabricacao', '2024-08', ['t29'], 'suggested', null],
  ['tensao_nominal_at', { raw: '15', unit: 'kV', state: 'measured' }, ['t33', 't34'], 'suggested', null],
  ['tensao_nominal_bt', { raw: '380', unit: 'V', state: 'measured' }, ['t38', 't39'], 'suggested', null],
  ['ligacao_secundaria', 'Dyn1', ['t42'], 'suggested', null],
];

function union(ids: string[]): [number, number, number, number] {
  const boxes = ids.map((id) => ocr.tokens.find((t) => t.id === id)!.bbox);
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
}

describe('8.4-UNIT buildReadingSuggestions over the committed plate fixture', () => {
  it('the fixture is the 43 tokens of the plate', () => {
    expect(fixture.outcome).toBe('ok');
    expect(ocr.image).toEqual({ width: 1600, height: 1100 });
    expect(ocr.tokens).toHaveLength(43);
    expect(ocr.tokens.every((t) => t.confidence === 0.99)).toBe(true);
    expect(ocr.preprocessing_applied).toBe(false);
  });

  it('emits the eleven suggestions of the README table, vol_oleo left out', () => {
    const { rows, dropped } = buildReadingSuggestions(input());
    expect(dropped).toEqual([]);
    expect(rows).toHaveLength(11);
    expect(rows.map((row) => row.target_path)).toEqual(TABLE.map(([key]) => `sheet/${BLOCK}/nameplate/${key}`));
    rows.forEach((row, index) => {
      const [key, value, cited, trust, hint] = TABLE[index]!;
      expect(row, key).toMatchObject({
        relatorio_id: RELATORIO,
        value,
        trust,
        hint,
        mode: 'fill',
        status: 'pending',
        prompt_version: 'fake-1',
        source: { photo_id: PHOTO, ocr_token_ids: cited, reading_run_id: RUN },
      });
      const [x0, y0, x1, y1] = union(cited);
      const expected = [x0 / 1600, y0 / 1100, x1 / 1600, y1 / 1100];
      row.source.bbox.forEach((v, i) => {
        expect(v, `${key} bbox ${i}`).toBeCloseTo(expected[i]!, 3);
        expect(Math.round(v * 10_000) / 10_000).toBe(v);
      });
    });
    expect(rows.find((row) => row.target_path.endsWith('/vol_oleo'))).toBeUndefined();
    expect(new Set(rows.map((row) => row.id)).size).toBe(11);
  });

  it('a cell filled before the run gets mode replace, the others fill', () => {
    const typed: Cell = { value: { raw: '15', unit: 'kV', state: 'measured' }, source_suggestion_id: null, op_id: uuid(50) };
    const empty: Cell = { value: { raw: '', unit: 'V', state: 'empty' }, source_suggestion_id: null, op_id: uuid(51) };
    const { rows } = buildReadingSuggestions(input({ block: block({ tensao_nominal_at: typed, tensao_nominal_bt: empty }) }));
    const modes = Object.fromEntries(rows.map((row) => [row.target_path.split('/').at(-1), row.mode]));
    expect(modes.tensao_nominal_at).toBe('replace');
    expect(modes.tensao_nominal_bt).toBe('fill');
    expect(Object.values(modes).filter((mode) => mode === 'replace')).toHaveLength(1);
  });

  it('a manufacturer the registry holds stores its name without the hint', () => {
    const celtta = { id: uuid(60), kind: 'manufacturer', name: 'CELTTA', gender: null, number: null, removed_at: null } as WordRow;
    const { rows } = buildReadingSuggestions(input({ registry: { manufacturers: [celtta], voltageClasses: [] } }));
    const row = rows.find((r) => r.target_path.endsWith('/fabricacao'))!;
    expect(row).toMatchObject({ value: 'CELTTA', trust: 'suggested', hint: null });
  });
});

describe('8.4-UNIT buildReadingSuggestions drops', () => {
  const values = (list: StructuringOutput['values']): StructuringOutput => ({ values: list });

  it('a key the nameplate does not have, a token the OCR did not return, an invalid shape', () => {
    const { rows, dropped } = buildReadingSuggestions(
      input({
        output: values([
          { key: 'corrente_nominal', value: '630', ocr_token_ids: ['t22'], confidence: 0.9 },
          { key: 'identificacao', value: 'TR-01', ocr_token_ids: ['t4', 't99'], confidence: 0.9 },
          { key: 'data_fabricacao', value: 'agosto', ocr_token_ids: ['t29'], confidence: 0.9 },
          { key: 'potencia_nominal', value: { raw: '5,00', unit: 'kVA', state: 'measured' }, ocr_token_ids: ['t22'], confidence: 0.9 },
          { key: 'tipo_de_isolacao', value: 'ÓLEO', ocr_token_ids: ['t15'], confidence: 0.9 },
          { key: 'n_serie', value: '240815-07', ocr_token_ids: ['t9'], confidence: 0.9 },
        ]),
      }),
    );
    expect(rows.map((row) => row.target_path)).toEqual([`sheet/${BLOCK}/nameplate/n_serie`]);
    expect(dropped).toEqual([
      { key: 'corrente_nominal', reason: 'unknown_key' },
      { key: 'identificacao', reason: 'unknown_token' },
      { key: 'tipo_de_isolacao', reason: 'invalid_shape' },
      { key: 'potencia_nominal', reason: 'invalid_shape' },
      { key: 'data_fabricacao', reason: 'invalid_shape' },
    ]);
  });

  it('cited ids come out in token-array order, once each', () => {
    const { rows } = buildReadingSuggestions(
      input({ output: values([{ key: 'potencia_nominal', value: { raw: '500', unit: 'kVA', state: 'measured' }, ocr_token_ids: ['t23', 't22', 't23'], confidence: 0.9 }]) }),
    );
    expect(rows[0]!.source.ocr_token_ids).toEqual(['t22', 't23']);
    expect(rows[0]!.trust).toBe('suggested');
  });

  it('a block type without a definition drops every value as an unknown key', () => {
    const { rows, dropped } = buildReadingSuggestions(input({ block: block({}, 'no_such_type') }));
    expect(rows).toEqual([]);
    expect(dropped).toHaveLength(11);
    expect(dropped.every((d) => d.reason === 'unknown_key')).toBe(true);
  });
});

describe('AIR-1 and AIR-V1 buildReadingSuggestions: units as printed, bare years', () => {
  const box = (n: number): [number, number, number, number] => [10 * n, 10, 10 * n + 8, 20];
  const plateOcr = ocrReadResultSchema.parse({
    image: { width: 1600, height: 1100 },
    tokens: [
      { id: 't0', text: '13.800', bbox: box(0), confidence: 0.99 },
      { id: 't1', text: 'V', bbox: box(1), confidence: 0.99 },
      { id: 't2', text: '2012', bbox: box(2), confidence: 0.99 },
      { id: 't3', text: '1,5', bbox: box(3), confidence: 0.99 },
      { id: 't4', text: 'MVA', bbox: box(4), confidence: 0.99 },
    ],
    preprocessing_applied: false,
  });
  const values = (rows: StructuringOutput['values']): StructuringOutput => structuringOutputSchema.parse({ values: rows });
  const value = (key: string, v: unknown, ids: string[]) => ({ key, value: v, ocr_token_ids: ids, confidence: 0.9 }) as StructuringOutput['values'][number];
  const rowOf = (rows: { target_path: string }[], key: string) => rows.find((row) => row.target_path.endsWith(`/${key}`));

  it('"13.800 V" on the kV field is 13,8 kV suggested; "1,5 MVA" is 1500 kVA; a bare year is suggested as printed', () => {
    const built = buildReadingSuggestions(
      input({
        ocr: plateOcr,
        output: values([
          value('tensao_nominal_at', { raw: '13800', unit: 'V', state: 'measured' }, ['t0', 't1']),
          value('data_fabricacao', '2012', ['t2']),
          value('potencia_nominal', { raw: '1.5', unit: 'MVA', state: 'measured' }, ['t3', 't4']),
        ]),
      }),
    );
    expect(built.dropped).toEqual([]);
    expect(rowOf(built.rows, 'tensao_nominal_at')).toMatchObject({ value: { raw: '13.8', unit: 'kV', state: 'measured' }, trust: 'suggested' });
    expect(rowOf(built.rows, 'data_fabricacao')).toMatchObject({ value: '2012', trust: 'suggested' });
    expect(rowOf(built.rows, 'potencia_nominal')).toMatchObject({ value: { raw: '1500', unit: 'kVA', state: 'measured' }, trust: 'suggested' });
  });

  it('a model that drops the unit no longer makes a 1,000 times wrong trusted value', () => {
    const built = buildReadingSuggestions(input({ ocr: plateOcr, output: values([value('tensao_nominal_at', { raw: '13800', unit: null, state: 'measured' }, ['t0', 't1'])]) }));
    expect(rowOf(built.rows, 'tensao_nominal_at')).toMatchObject({ value: { raw: '13.8', unit: 'kV' }, trust: 'suggested' });
  });

  it('a wrong digit stays a check after the conversion: the digit rule reads the printed raw', () => {
    const built = buildReadingSuggestions(input({ ocr: plateOcr, output: values([value('tensao_nominal_at', { raw: '13900', unit: 'V', state: 'measured' }, ['t0', 't1'])]) }));
    expect(rowOf(built.rows, 'tensao_nominal_at')).toMatchObject({ value: { raw: '13.9', unit: 'kV' }, trust: 'verify' });
  });

  it('a model raw that kept the pt-BR thousands dot is the printed number, as a check', () => {
    const built = buildReadingSuggestions(input({ ocr: plateOcr, output: values([value('tensao_nominal_at', { raw: '13.800', unit: 'V', state: 'measured' }, ['t0', 't1'])]) }));
    expect(rowOf(built.rows, 'tensao_nominal_at')).toMatchObject({ value: { raw: '13.8', unit: 'kV' }, trust: 'verify' });
  });
});
