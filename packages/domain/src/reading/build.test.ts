import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ocrReadResultSchema, structuringOutputSchema, type StructuringOutput } from '../contract/ocr.ts';
import type { WordRow } from '../registry/word-row.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition, SEED_VERSION } from '../seed/definitions.ts';
import { confirmAllCandidates } from '../relatorio/suggestion-group.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { buildReadingSuggestions, DIAGRAM_READ_NOTE, plateSuggestionNoteText, vectorGroupReadOf, type BuildReadingSuggestionsInput } from './build.ts';
import { FULL_IMAGE_BBOX } from './prose.ts';

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

/**
 * The synthetic plate is drawn for the transformer of seeds v1 to v12 (its text TAP ATUAL): the
 * README table is that sheet's. Seed v13 (Story 23.7) replaces TAP ATUAL by TAPS and a numeric TAP
 * ATUAL, so the plate's `tap_atual` is no key there (the last test below).
 */
const PLATE_SEED = 'v12';

function block(nameplate: Record<string, Cell> = {}, blockType = 'transformador_forca', seedVersion = PLATE_SEED): BuildReadingSuggestionsInput['block'] {
  return { id: BLOCK, seed_version: seedVersion, block_type: blockType, sheet: { nameplate, checklist: {}, test: {} } as unknown as BlockRow['sheet'] };
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

describe('23.7-UNIT the committed transformer plate on a v13 sheet', () => {
  it('suggests the same values but TAP ATUAL, whose text key v13 replaced (the plate prints no TAPS)', () => {
    // The current seed since Story 25.5 is v15, which keeps v13's transformer nameplate as v14 did; this sheet names v13.
    expect(SEED_VERSION).toBe('v15');
    const { rows, dropped } = buildReadingSuggestions(input({ block: block({}, 'transformador_forca', 'v13') }));
    expect(dropped).toEqual([{ key: 'tap_atual', reason: 'unknown_key' }]);
    expect(rows.map((row) => row.target_path.split('/').at(-1))).toEqual(TABLE.map(([key]) => key).filter((key) => key !== 'tap_atual'));
  });
});

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
          // Seed v12 offers ÓLEO MINERAL (Story 22.7, ÓLEO read as it); a value outside the list is still refused.
          { key: 'tipo_de_isolacao', value: 'ÓLEO VEGETAL', ocr_token_ids: ['t15'], confidence: 0.9 },
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

  it('Story 15.3: a v9 TC drops a read POTÊNCIA NOMINAL as an unknown key; a v8 TC still suggests it', () => {
    const tcOn = (seed: string): BuildReadingSuggestionsInput['block'] => ({ ...block({}, 'tc'), seed_version: seed });
    const v9 = buildReadingSuggestions(input({ block: tcOn('v9') }));
    expect(v9.rows.map((row) => row.target_path.split('/').at(-1))).not.toContain('potencia_nominal');
    expect(v9.dropped).toContainEqual({ key: 'potencia_nominal', reason: 'unknown_key' });
    const v8 = buildReadingSuggestions(input({ block: tcOn('v8') }));
    expect(v8.rows.map((row) => row.target_path.split('/').at(-1))).toContain('potencia_nominal');
    expect(v8.dropped.map((d) => d.key)).not.toContain('potencia_nominal');
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

  it('a unit only the model gives, cited by its number alone, is converted as a check (r8read-correctness-1)', () => {
    const built = buildReadingSuggestions(
      input({
        ocr: plateOcr,
        output: values([
          value('tensao_nominal_at', { raw: '13800', unit: 'V', state: 'measured' }, ['t0']),
          value('potencia_nominal', { raw: '1.5', unit: 'MVA', state: 'measured' }, ['t3']),
        ]),
      }),
    );
    expect(rowOf(built.rows, 'tensao_nominal_at')).toMatchObject({ value: { raw: '13.8', unit: 'kV' }, trust: 'verify' });
    expect(rowOf(built.rows, 'potencia_nominal')).toMatchObject({ value: { raw: '1500', unit: 'kVA' }, trust: 'verify' });
  });

  it('a model raw that kept the pt-BR thousands dot is the printed number, as a check', () => {
    const built = buildReadingSuggestions(input({ ocr: plateOcr, output: values([value('tensao_nominal_at', { raw: '13.800', unit: 'V', state: 'measured' }, ['t0', 't1'])]) }));
    expect(rowOf(built.rows, 'tensao_nominal_at')).toMatchObject({ value: { raw: '13.8', unit: 'kV' }, trust: 'verify' });
  });
});

describe('21.2-UNIT the vector group from the plate', () => {
  /** A plate with the group code printed (t2), split (t3 t4), and the diagram's terminal labels (t5 t6). */
  const groupOcr = ocrReadResultSchema.parse({
    image: { width: 1000, height: 1000 },
    tokens: [
      { id: 't0', text: 'LIGAÇÃO', bbox: [10, 10, 100, 30], confidence: 0.99 },
      { id: 't1', text: 'SECUNDÁRIA', bbox: [110, 10, 250, 30], confidence: 0.99 },
      { id: 't2', text: 'Dyn1', bbox: [300, 10, 360, 30], confidence: 0.99 },
      { id: 't3', text: 'Dyn', bbox: [300, 50, 340, 70], confidence: 0.99 },
      { id: 't4', text: '1', bbox: [345, 50, 355, 70], confidence: 0.99 },
      { id: 't5', text: 'H1', bbox: [500, 500, 520, 520], confidence: 0.99 },
      { id: 't6', text: 'X1', bbox: [700, 500, 720, 520], confidence: 0.99 },
      { id: 't7', text: 'Dyn11', bbox: [300, 90, 370, 110], confidence: 0.99 },
      { id: 't8', text: '(Dyn1)', bbox: [300, 130, 370, 150], confidence: 0.99 },
    ],
    preprocessing_applied: false,
  });
  const read = (version: string, value: string, ids: string[], blockType = 'transformador_forca') =>
    buildReadingSuggestions(
      input({
        block: { ...block({}, blockType), seed_version: version },
        ocr: groupOcr,
        image: { width: 1000, height: 1000 },
        output: structuringOutputSchema.parse({ values: [{ key: 'ligacao_secundaria', value, ocr_token_ids: ids, confidence: 0.9 }] }),
      }),
    );

  it('v11: a printed "Dyn1" is suggested citing its token; "DYN1" lands as the option "Dyn1"; split or labelled runs count as printed', () => {
    for (const [value, ids] of [
      ['Dyn1', ['t2']],
      ['DYN1', ['t2']],
      ['Dyn1', ['t3', 't4']],
      ['Dyn1', ['t0', 't1', 't2']],
    ] as const) {
      const built = read('v11', value, [...ids]);
      expect(built.dropped, `${value} ${ids.join(' ')}`).toEqual([]);
      const row = built.rows[0]!;
      expect(row.value).toBe('Dyn1');
      expect(row.trust).toBe('suggested');
      expect(row.source.ocr_token_ids).toEqual(ids);
      expect(row.source.bbox).not.toEqual(FULL_IMAGE_BBOX);
      expect(plateSuggestionNoteText(row)).toBeNull();
    }
  });

  it('v11: a group read from the drawn diagram (its cited tokens do not print it) is verify, cites no token, covers the whole image and carries the note; never a Confirmar todos candidate', () => {
    const built = read('v11', 'Yyn0', ['t5', 't6']);
    const row = built.rows[0]!;
    expect(row).toMatchObject({ value: 'Yyn0', trust: 'verify', status: 'pending', target_path: `sheet/${BLOCK}/nameplate/ligacao_secundaria` });
    expect(row.source.ocr_token_ids).toEqual([]);
    expect(row.source.bbox).toEqual(FULL_IMAGE_BBOX);
    expect(plateSuggestionNoteText(row)).toBe('Lido do diagrama — confira');
    const sheet = { id: BLOCK, seed_version: 'v11', block_type: 'transformador_forca', sheet: { nameplate: {}, checklist: {}, test: {} } as unknown as BlockRow['sheet'], config: defaultBlockConfig('v11', 'transformador_forca') };
    expect(confirmAllCandidates(sheet as never, [row], [], EMPTY_DEFINITION_CONTEXT)).toEqual([]);
    expect(confirmAllCandidates(sheet as never, read('v11', 'Dyn1', ['t2']).rows, [], EMPTY_DEFINITION_CONTEXT)).toHaveLength(1);
  });

  it('v11: the cited runs decide: the same group printed is suggested ("(Dyn1)" too); another group printed is verify with its citations and box, no note; no group printed is the diagram read', () => {
    const same = read('v11', 'Dyn1', ['t8']).rows[0]!;
    expect(same).toMatchObject({ value: 'Dyn1', trust: 'suggested' });
    expect(same.source.ocr_token_ids).toEqual(['t8']);
    for (const [value, ids] of [
      ['Dyn1', ['t7']],
      ['Yyn0', ['t2']],
    ] as const) {
      const other = read('v11', value, [...ids]).rows[0]!;
      expect(other, `${value} ${ids.join(' ')}`).toMatchObject({ value, trust: 'verify' });
      expect(other.source.ocr_token_ids).toEqual(ids);
      expect(other.source.bbox).not.toEqual(FULL_IMAGE_BBOX);
      expect(plateSuggestionNoteText(other)).toBeNull();
    }
    const none = read('v11', 'Dyn1', ['t5']).rows[0]!;
    expect(none).toMatchObject({ value: 'Dyn1', trust: 'verify' });
    expect(none.source.ocr_token_ids).toEqual([]);
    expect(none.source.bbox).toEqual(FULL_IMAGE_BBOX);
    expect(plateSuggestionNoteText(none)).toBe(DIAGRAM_READ_NOTE);
  });

  it('v11: a value naming no group is dropped (invalid_shape), as any select value outside its options', () => {
    expect(read('v11', 'Y', ['t5'])).toEqual({ rows: [], dropped: [{ key: 'ligacao_secundaria', reason: 'invalid_shape' }] });
  });

  it('v9/v10 text: a parsed group is stored as its code; an unparsed text is offered as read', () => {
    for (const version of ['v9', 'v10']) {
      expect(read(version, 'DYN1', ['t2']).rows[0]).toMatchObject({ value: 'Dyn1', trust: 'suggested' });
      const unparsed = read(version, 'Y', ['t0']).rows[0]!;
      expect(unparsed).toMatchObject({ value: 'Y', trust: 'suggested' });
      expect(unparsed.source.ocr_token_ids).toEqual(['t0']);
      const drawn = read(version, 'Yyn0', ['t5']).rows[0]!;
      expect(drawn).toMatchObject({ value: 'Yyn0', trust: 'verify' });
      expect(plateSuggestionNoteText(drawn)).toBe('Lido do diagrama — confira');
    }
  });

  it('TP and TC keep LIGAÇÃO SECUNDÁRIA as read', () => {
    for (const type of ['tp', 'tc']) {
      const row = read('v11', 'DYN1', ['t2'], type).rows[0]!;
      expect(row, type).toMatchObject({ value: 'DYN1' });
      expect(row.source.ocr_token_ids).toEqual(['t2']);
    }
  });

  it('the note names only a nameplate suggestion citing no token', () => {
    const source = { photo_id: PHOTO, bbox: FULL_IMAGE_BBOX, ocr_token_ids: [], reading_run_id: RUN };
    expect(plateSuggestionNoteText({ target_path: `sheet/${BLOCK}/nameplate/ligacao_secundaria`, source })).toBe(DIAGRAM_READ_NOTE);
    expect(plateSuggestionNoteText({ target_path: `file/${PHOTO}/caption`, source })).toBeNull();
    expect(plateSuggestionNoteText({ target_path: `sheet/${BLOCK}/checklist/limpeza/observation`, source })).toBeNull();
    expect(plateSuggestionNoteText({ target_path: `sheet/${BLOCK}/nameplate/ligacao_secundaria`, source: { ...source, ocr_token_ids: ['t1'] } })).toBeNull();
  });
});

describe('e21a R-2 vectorGroupReadOf: the kernel classification of one structured group value, as the job stores it', () => {
  const groupField = (version: string) => getDefinition(version, 'cabine_primaria', 'transformador_forca').nameplate.find((field) => field.key === 'ligacao_secundaria')!;
  const tokens = [
    { id: 't0', text: 'LIGAÇÃO' },
    { id: 't1', text: 'Dyn1' },
    { id: 't2', text: 'H1' },
    { id: 't3', text: 'Dyn' },
    { id: 't4', text: '1' },
    { id: 't5', text: 'I' },
  ];
  const entry = (value: unknown, ocr_token_ids: readonly unknown[]) => ({ value, ocr_token_ids });

  it('printed: the cited run prints the entry\'s own group (one word, split, or "Dyn" "I")', () => {
    for (const version of ['v9', 'v10', 'v11']) {
      for (const ids of [['t1'], ['t3', 't4'], ['t4', 't3'], ['t3', 't5']]) {
        expect(vectorGroupReadOf(groupField(version), entry('Dyn1', ids), tokens), `${version} ${ids.join(' ')}`).toEqual({ kind: 'printed', code: 'Dyn1' });
      }
      expect(vectorGroupReadOf(groupField(version), entry('DYN1', ['t1']), tokens)).toEqual({ kind: 'printed', code: 'Dyn1' });
    }
  });

  it('other group: the cited run prints another group; diagram: it prints none', () => {
    for (const version of ['v9', 'v10', 'v11']) {
      expect(vectorGroupReadOf(groupField(version), entry('Dy1', ['t1']), tokens)).toEqual({ kind: 'other_group', code: 'Dy1' });
      expect(vectorGroupReadOf(groupField(version), entry('Dy1', ['t2']), tokens)).toEqual({ kind: 'diagram', code: 'Dy1' });
    }
  });

  it('dropped: an unknown cited id, no citation, a non-string id (unknown_token); a v11 value naming no option (invalid_shape)', () => {
    for (const version of ['v9', 'v10', 'v11']) {
      for (const ids of [['t1', 't99'], [], [7], ['t99']]) {
        expect(vectorGroupReadOf(groupField(version), entry('Dyn1', ids), tokens), `${version} ${JSON.stringify(ids)}`).toEqual({ kind: 'dropped', reason: 'unknown_token' });
      }
    }
    expect(vectorGroupReadOf(groupField('v11'), entry('Y', ['t0']), tokens)).toEqual({ kind: 'dropped', reason: 'invalid_shape' });
    expect(vectorGroupReadOf(groupField('v11'), entry({ raw: '1', unit: null, state: 'measured' }, ['t0']), tokens)).toEqual({ kind: 'dropped', reason: 'invalid_shape' });
  });

  it('unparsed: a v9/v10 text naming no group is stored as read', () => {
    for (const version of ['v9', 'v10']) {
      expect(vectorGroupReadOf(groupField(version), entry('  Y ', ['t0']), tokens)).toEqual({ kind: 'unparsed', value: 'Y' });
    }
  });

  it('the value is read after the job\'s normalization: an accented "Dýn1" lands on the v11 option Dyn1 and is printed', () => {
    expect(vectorGroupReadOf(groupField('v11'), entry('Dýn1', ['t1']), tokens)).toEqual({ kind: 'printed', code: 'Dyn1' });
  });

  it('agrees with buildReadingSuggestions on every row: printed and other group cite their words, diagram cites none, dropped stores nothing', () => {
    const groupOcr = ocrReadResultSchema.parse({
      image: { width: 1000, height: 1000 },
      tokens: tokens.map((token, i) => ({ ...token, bbox: [10 + i * 100, 10, 90 + i * 100, 30], confidence: 0.99 })),
      preprocessing_applied: false,
    });
    const cases: [string, string, string[]][] = [
      ['v11', 'Dyn1', ['t1']],
      ['v11', 'Dyn1', ['t3', 't5']],
      ['v11', 'Dýn1', ['t1']],
      ['v11', 'Dy1', ['t1']],
      ['v11', 'Dy1', ['t2']],
      ['v11', 'Dyn1', ['t1', 't99']],
      ['v11', 'Y', ['t0']],
      ['v10', 'Y', ['t0']],
      ['v10', 'Dyn1', ['t1']],
    ];
    for (const [version, value, ids] of cases) {
      const built = buildReadingSuggestions(
        input({
          block: { ...block(), seed_version: version },
          ocr: groupOcr,
          image: { width: 1000, height: 1000 },
          output: { values: [{ key: 'ligacao_secundaria', value, ocr_token_ids: ids, confidence: 0.9 }] },
        }),
      );
      const read = vectorGroupReadOf(groupField(version), entry(value, ids), groupOcr.tokens);
      const label = `${version} ${value} ${ids.join(' ')}`;
      const row = built.rows[0];
      switch (read.kind) {
        case 'dropped':
          expect(built, label).toEqual({ rows: [], dropped: [{ key: 'ligacao_secundaria', reason: read.reason }] });
          break;
        case 'unparsed':
          expect(row, label).toMatchObject({ value: read.value });
          break;
        case 'printed':
          expect(row, label).toMatchObject({ value: read.code });
          expect(row!.source.ocr_token_ids, label).toEqual(ids);
          expect(plateSuggestionNoteText(row!), label).toBeNull();
          break;
        case 'other_group':
          expect(row, label).toMatchObject({ value: read.code, trust: 'verify' });
          expect(row!.source.ocr_token_ids, label).toEqual(ids);
          break;
        case 'diagram':
          expect(row, label).toMatchObject({ value: read.code, trust: 'verify' });
          expect(plateSuggestionNoteText(row!), label).toBe(DIAGRAM_READ_NOTE);
          break;
      }
    }
  });
});
