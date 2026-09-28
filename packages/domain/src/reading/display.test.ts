import { describe, expect, it } from 'vitest';
import type { OcrReadResult, OcrToken } from '../contract/ocr.ts';
import { emptySheet, type BlockRow, type Cell } from '../schemas/entities.ts';
import { buildDisplaySuggestions, DISPLAY_MIN_CONFIDENCE, DISPLAY_PROMPT_VERSION, displayUnitOf, displayValues, type BuildDisplaySuggestionsInput } from './display.ts';
import { displayCellTarget, displayEnvTarget, displayReadingTargetSchema, isDisplayCellTarget } from './target.ts';

/*
 * 9.1-UNIT: the display reading's kernel over the tokens the sidecar recorded for the six
 * synthetic displays (`apps/api/src/jobs/reading/fixtures/`, their images in
 * `services/ocr/tests/fixtures/displays.md`), copied here, and every row of the story's I/O
 * matrix.
 */

const uuid = (n: number) => `019966b0-0091-7000-8000-${n.toString(16).padStart(12, '0')}`;
const RELATORIO = uuid(1);
const PHOTO = uuid(2);
const RUN = uuid(3);
const BLOCK = uuid(4);
const LOCATION = uuid(5);
const OP = uuid(6);

type Box = [number, number, number, number];
const tok = (i: number, text: string, bbox: Box, confidence: number): OcrToken => ({ id: `t${i}`, text, bbox, confidence });
const read = (tokens: OcrToken[]): OcrReadResult => ({ image: { width: 1200, height: 900 }, tokens, preprocessing_applied: false });

/** The recorded sidecar reads (`POST /read/display`) of the six synthetic displays. */
const MEGOHMETRO = [tok(0, 'MODELOSINTETICO', [81, 64, 381, 91], 0.9872), tok(1, '3.42', [325, 307, 729, 556], 0.9759)];
const ISOLACAO = [tok(0, 'MODELOSINTETICO', [81, 64, 380, 91], 0.9883), tok(1, '147', [278, 323, 615, 533], 0.9527), tok(2, 'Gn', [602, 444, 719, 513], 0.6492)];
const MICROHMIMETRO = [
  tok(0, 'MODELOSINTETICO', [81, 64, 380, 91], 0.9879),
  tok(1, '12/03/202610:15', [122, 192, 1079, 296], 0.9751),
  tok(2, 'I=10.0A', [124, 304, 548, 392], 0.9229),
  tok(3, '87.', [647, 304, 829, 395], 0.1677),
  tok(4, 'UR', [794, 303, 964, 394], 0.4366),
];
const TTR = [
  tok(0, 'MODELOSINTETICO', [80, 64, 379, 91], 0.9869),
  tok(1, '12/03/2026', [122, 194, 725, 294], 0.9935),
  tok(2, '10:40', [769, 201, 1077, 286], 0.9671),
  tok(3, 'RATIO=34.512', [121, 303, 956, 395], 0.9364),
];
const TERMO = [
  tok(0, 'MODELOSINTETICO', [81, 64, 381, 91], 0.9871),
  tok(1, '23.4CC', [211, 201, 650, 405], 0.2603),
  tok(2, '58', [212, 470, 451, 672], 0.997),
  tok(3, '%UR', [448, 576, 602, 646], 0.9966),
];
const TRES_VALORES = [
  tok(0, 'MODELOSINTETICO', [81, 64, 380, 91], 0.9879),
  tok(1, 'R30s', [124, 201, 359, 284], 0.9772),
  tok(2, '1.20', [417, 203, 664, 286], 0.9624),
  tok(3, 'GO', [712, 201, 842, 286], 0.3126),
  tok(4, 'R1m', [122, 306, 306, 391], 0.9841),
  tok(5, '1.45', [415, 307, 664, 394], 0.9869),
  tok(6, 'GD', [711, 307, 844, 394], 0.2449),
  tok(7, 'R10m', [126, 412, 365, 495], 0.9561),
  tok(8, '1.80', [413, 410, 664, 500], 0.9794),
  tok(9, 'GD', [710, 410, 844, 501], 0.2921),
];

const GOHM = 'GΩ';
const MICRO = 'µΩ';

const values = (tokens: OcrToken[]) => displayValues(tokens).map((v) => ({ raw: v.raw, unit: v.unit, ids: v.tokens.map((t) => t.id) }));

describe('9.1-UNIT displayValues over the six synthetic displays', () => {
  it('reads each display as `displays.json` lists it', () => {
    expect(values(MEGOHMETRO)).toEqual([{ raw: '3.42', unit: null, ids: ['t1'] }]);
    expect(values(ISOLACAO)).toEqual([{ raw: '147', unit: GOHM, ids: ['t1', 't2'] }]);
    expect(values(MICROHMIMETRO)).toEqual([{ raw: '87', unit: MICRO, ids: ['t3', 't4'] }]);
    expect(values(TTR)).toEqual([{ raw: '34.512', unit: null, ids: ['t3'] }]);
    expect(values(TERMO)).toEqual([
      { raw: '23.4', unit: '°C', ids: ['t1'] },
      { raw: '58', unit: '%', ids: ['t2', 't3'] },
    ]);
    expect(values(TRES_VALORES)).toEqual([
      { raw: '1.2', unit: GOHM, ids: ['t2', 't3'] },
      { raw: '1.45', unit: GOHM, ids: ['t5', 't6'] },
      { raw: '1.8', unit: GOHM, ids: ['t8', 't9'] },
    ]);
  });

  it('skips dates, times, the test current and annotations; reads after the last "="', () => {
    const tokens = [tok(0, '12/03/2026', [0, 0, 10, 10], 0.9), tok(1, '10:15', [20, 0, 30, 10], 0.9), tok(2, 'I=10.0A', [0, 20, 10, 30], 0.9), tok(3, '50Hz', [20, 20, 30, 30], 0.9), tok(4, '5kV', [0, 40, 10, 50], 0.9)];
    expect(displayValues(tokens)).toEqual([]);
    expect(values([tok(0, 'R=1,5', [0, 0, 10, 10], 0.9)])).toEqual([{ raw: '1.5', unit: null, ids: ['t0'] }]);
    // "10 A" as two tokens on one row is an annotation too.
    expect(values([tok(0, '10', [0, 0, 10, 10], 0.9), tok(1, 'A', [12, 0, 20, 10], 0.9)])).toEqual([]);
    // A unit on another row is not this value's.
    expect(values([tok(0, '147', [0, 0, 10, 10], 0.9), tok(1, 'GO', [0, 20, 10, 30], 0.9)])).toEqual([{ raw: '147', unit: null, ids: ['t0'] }]);
    // "mΩ" in the same token is a unit, not the "m" annotation.
    expect(values([tok(0, '87mΩ', [0, 0, 10, 10], 0.9)])).toEqual([{ raw: '87', unit: `mΩ`, ids: ['t0'] }]);
    // An annotation after a space in the same token.
    expect(displayValues([tok(0, '10 A', [0, 0, 10, 10], 0.9), tok(1, '5 kV', [0, 20, 10, 30], 0.9)])).toEqual([]);
  });

  it('reads the value a date, a time or the test current shares a token with', () => {
    const one = (text: string) => displayValues([tok(0, text, [0, 0, 100, 10], 0.9)]).map((v) => ({ raw: v.raw, unit: v.unit, covered: v.covered }));
    expect(one('10:15 87.5UR')).toEqual([{ raw: '87.5', unit: MICRO, covered: true }]);
    expect(one('06/09/202621:3687')).toEqual([{ raw: '87', unit: null, covered: true }]);
    expect(one('I=10.0A193u\u03a9')).toEqual([{ raw: '193', unit: MICRO, covered: true }]);
    expect(one('I=10.0A 193')).toEqual([{ raw: '193', unit: null, covered: true }]);
  });

  it('maps the recognizer spellings of a unit back', () => {
    for (const text of ['GO', 'Gn', 'GD', 'GΩ', 'g0']) expect(displayUnitOf(text)).toBe(GOHM);
    expect(displayUnitOf('UR')).toBe(MICRO);
    expect(displayUnitOf('MO')).toBe('MΩ');
    expect(displayUnitOf('TQ')).toBe('TΩ');
    expect(displayUnitOf('%UR')).toBe('%');
    expect(displayUnitOf('CC')).toBe('°C');
    expect(displayUnitOf('°C')).toBe('°C');
    expect(displayUnitOf('MODELO')).toBeNull();
  });
});

describe('9.1-UNIT the display reading target', () => {
  it('parses a cell target and an environment target, and refuses anything else', () => {
    const cell = displayCellTarget(BLOCK, 'chave_seccionadora', 'isolacao', { row: 0, col: 0 });
    expect(cell).toEqual({ block_id: BLOCK, block_type: 'chave_seccionadora', table_key: 'isolacao', start_cell: { row: 0, col: 0 } });
    expect(isDisplayCellTarget(displayReadingTargetSchema.parse(cell))).toBe(true);
    expect(isDisplayCellTarget(displayReadingTargetSchema.parse(displayEnvTarget(LOCATION)))).toBe(false);
    expect(displayReadingTargetSchema.safeParse({ block_id: BLOCK }).success).toBe(false);
    expect(displayReadingTargetSchema.safeParse({ block_id: BLOCK, block_type: 'x', table_key: 'isolacao', start_cell: { row: -1, col: 0 } }).success).toBe(false);
    expect(displayReadingTargetSchema.safeParse(null).success).toBe(false);
  });
});

// --- the suggestions -------------------------------------------------------------------------

const measured = (raw: string, unit: string | null): Cell => ({ value: { raw, unit, state: 'measured' }, source_suggestion_id: null, op_id: OP });

function block(blockType: string, cells: Record<string, Record<string, Record<string, Cell>>> = {}): NonNullable<BuildDisplaySuggestionsInput['block']> {
  const test: Record<string, { cells: Record<string, Record<string, Cell>> }> = {};
  for (const [key, rows] of Object.entries(cells)) test[key] = { cells: rows };
  return { id: BLOCK, seed_version: 'v1', block_type: blockType, sheet: { ...emptySheet(), test } as BlockRow['sheet'] };
}

function counter(start = 100): () => string {
  let n = start;
  return () => uuid(n++);
}

function build(tokens: OcrToken[], target: BuildDisplaySuggestionsInput['target'], overrides: Partial<BuildDisplaySuggestionsInput> = {}) {
  return buildDisplaySuggestions({
    relatorioId: RELATORIO,
    photoId: PHOTO,
    runId: RUN,
    target,
    block: block('chave_seccionadora'),
    location: null,
    ocr: read(tokens),
    image: { width: 1200, height: 900 },
    newId: counter(),
    ...overrides,
  });
}

const sec = (row: number, col = 0, testKey = 'isolacao') => displayCellTarget(BLOCK, 'chave_seccionadora', testKey, { row, col });
const cellPath = (testKey: string, row: number, col: number) => `sheet/${BLOCK}/test/${testKey}/cell/${row}/${col}`;

describe('9.1-UNIT buildDisplaySuggestions: the I/O matrix', () => {
  it('single value, empty cell: one pending suggestion in GΩ, suggested, fill, boxed on the cited tokens', () => {
    const { rows, dropped } = build(ISOLACAO, sec(0));
    expect(dropped).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      relatorio_id: RELATORIO,
      target_path: cellPath('isolacao', 0, 0),
      value: { raw: '147', unit: GOHM, state: 'measured' },
      trust: 'suggested',
      mode: 'fill',
      status: 'pending',
      prompt_version: DISPLAY_PROMPT_VERSION,
      hint: null,
      source: { photo_id: PHOTO, reading_run_id: RUN, ocr_token_ids: ['t1', 't2'], bbox: [0.2317, 0.3589, 0.5992, 0.5922] },
    });
  });

  it('no unit printed: the previous row stored unit, suggested; with none stored, the column default, verify', () => {
    const withPrevious = build(MEGOHMETRO, sec(1), { block: block('chave_seccionadora', { isolacao: { '0': { '0': measured('1.2', GOHM) } } }) });
    expect(withPrevious.rows[0]).toMatchObject({ target_path: cellPath('isolacao', 1, 0), value: { raw: '3.42', unit: GOHM }, trust: 'suggested' });
    const bare = build(MEGOHMETRO, sec(1));
    expect(bare.rows[0]).toMatchObject({ value: { raw: '3.42', unit: GOHM }, trust: 'verify' });
    // The cell's own stored unit comes first.
    const own = build(MEGOHMETRO, sec(1), { block: block('chave_seccionadora', { isolacao: { '0': { '0': measured('1.2', GOHM) }, '1': { '0': measured('3', 'MΩ') } } }) });
    expect(own.rows[0]).toMatchObject({ value: { unit: 'MΩ' }, trust: 'suggested', mode: 'replace' });
    // A single-unit column's default is no guess.
    const contact = build(MEGOHMETRO, sec(0, 0, 'resistencia_contato'));
    expect(contact.rows[0]).toMatchObject({ value: { raw: '3.42', unit: MICRO }, trust: 'suggested' });
  });

  it('a printed unit the column does not accept is verify, the unit taken from the cell side', () => {
    const { rows } = build(ISOLACAO, sec(0, 0, 'resistencia_contato'));
    expect(rows[0]).toMatchObject({ value: { raw: '147', unit: MICRO }, trust: 'verify' });
  });

  it('low confidence: verify', () => {
    const { rows } = build(MICROHMIMETRO, sec(0, 0, 'resistencia_contato'));
    expect(DISPLAY_MIN_CONFIDENCE).toBe(0.5);
    expect(rows[0]).toMatchObject({ target_path: cellPath('resistencia_contato', 0, 0), value: { raw: '87', unit: MICRO }, trust: 'verify' });
  });

  it('fixed decimals ("1.20") are covered by the token that prints them: suggested', () => {
    const { rows } = build([tok(0, '1.20', [0, 0, 100, 10], 0.99), tok(1, 'GO', [110, 0, 150, 10], 0.99)], sec(0));
    expect(rows[0]).toMatchObject({ value: { raw: '1.2', unit: GOHM }, trust: 'suggested' });
  });

  it('a value whose digits are not the cited token digits: verify', () => {
    const { rows } = build([tok(0, '1.20GΩ1.45', [0, 0, 100, 10], 0.99)], sec(0));
    expect(rows[0]).toMatchObject({ value: { raw: '1.2' }, trust: 'verify' });
  });

  it('stored 30 s / 1 min / 10 min on a transformer: 1 MINUTO gets the second value, the print columns dropped', () => {
    const target = displayCellTarget(BLOCK, 'transformador_forca', 'isolacao', { row: 0, col: 1 });
    const { rows, dropped } = build(TRES_VALORES, target, { block: block('transformador_forca') });
    expect(rows.map((row) => [row.target_path, row.value])).toEqual([[cellPath('isolacao', 0, 1), { raw: '1.45', unit: GOHM, state: 'measured' }]]);
    expect(dropped).toEqual([
      { key: '0:1.2', reason: 'print_column' },
      { key: '2:1.8', reason: 'print_column' },
    ]);
  });

  it('several values on one column fill the capture cells in reading order; past the last, no_cell', () => {
    const { rows, dropped } = build(TRES_VALORES, sec(0));
    expect(rows.map((row) => row.target_path)).toEqual([cellPath('isolacao', 0, 0), cellPath('isolacao', 1, 0), cellPath('isolacao', 2, 0)]);
    expect(dropped).toEqual([]);
    const late = build(TRES_VALORES, sec(5));
    expect(late.rows.map((row) => row.target_path)).toEqual([cellPath('isolacao', 5, 0)]);
    expect(late.dropped).toEqual([
      { key: '1:1.45', reason: 'no_cell' },
      { key: '2:1.8', reason: 'no_cell' },
    ]);
  });

  it('typed equal or different: mode replace, the typed cell never touched', () => {
    const typed = block('chave_seccionadora', { isolacao: { '0': { '0': measured('14.7', GOHM) } } });
    const { rows } = build(ISOLACAO, sec(0), { block: typed });
    expect(rows[0]).toMatchObject({ mode: 'replace', value: { raw: '147', unit: GOHM } });
    expect(typed.sheet.test.isolacao!.cells['0']!['0']).toEqual(measured('14.7', GOHM));
  });

  it('env: temperature and humidity by unit; a value without a unit maps nowhere', () => {
    const location = { id: LOCATION, env: { altitude_m: null, temperature_c: null, humidity_pct: { raw: '60', unit: '%', state: 'measured' as const } } };
    const { rows, dropped } = build([...TERMO, tok(4, '12', [0, 800, 50, 850], 0.99)], displayEnvTarget(LOCATION), { block: null, location });
    expect(rows.map((row) => [row.target_path, row.value, row.trust, row.mode])).toEqual([
      [`location/${LOCATION}/env/temperature_c`, { raw: '23.4', unit: '°C', state: 'measured' }, 'verify', 'fill'],
      [`location/${LOCATION}/env/humidity_pct`, { raw: '58', unit: '%', state: 'measured' }, 'suggested', 'replace'],
    ]);
    expect(dropped).toEqual([{ key: '2:12', reason: 'no_cell' }]);
    const twice = build([tok(0, '58%', [0, 0, 10, 10], 0.9), tok(1, '59%', [0, 20, 10, 30], 0.9)], displayEnvTarget(LOCATION), { block: null, location });
    expect(twice.dropped).toEqual([{ key: '1:59', reason: 'duplicate' }]);
  });

  it('no value read (dates and labels only, a far shot): no suggestion', () => {
    expect(build([tok(0, 'MODELOSINTETICO', [0, 0, 10, 10], 0.9), tok(1, '12/03/2026', [0, 20, 10, 30], 0.9)], sec(0))).toEqual({ rows: [], dropped: [] });
    expect(build([], sec(0))).toEqual({ rows: [], dropped: [] });
  });

  it('a test the block does not have drops every value as no_cell', () => {
    expect(build(ISOLACAO, displayCellTarget(BLOCK, 'chave_seccionadora', 'relacao_transformacao', { row: 0, col: 3 })).dropped).toEqual([{ key: '0:147', reason: 'no_cell' }]);
  });
});
