import { describe, expect, it } from 'vitest';
import { emptySheet, suggestionRowSchema, type BlockRow, type Cell, type JsonValue, type LocationRow, type SuggestionRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import { displayCellTarget, displayEnvTarget } from '../reading/target.ts';
import { TEST_RELATORIO } from '../test-support.ts';
import {
  blocksWithPendingSuggestions,
  displayBurstHintText,
  displayBurstStart,
  displayBurstStop,
  displayBurstStops,
  displayMismatchText,
  displayQueuedCells,
  displayQueuedEnv,
  envSuggestions,
  livePendingSuggestions,
  measurementConfirmAllCandidates,
  measurementSuggestions,
  measurementTableVerifyCount,
  storedTestCell,
  suggestionBlockId,
  suggestionTarget,
} from './suggestions.ts';

/*
 * 9.1-UNIT: the kernel rules of a display reading's suggestions on the device -- Measurement
 * cells and the thermo-hygrometer fields, the mismatch line, the burst and the queued cells.
 */

const id = (n: number) => `019966b0-0092-7000-8000-${n.toString(16).padStart(12, '0')}`;
const BLOCK = id(1);
const OTHER = id(2);
const CABINE = id(3);
const PHOTO = id(4);
const RUN = id(5);
const OP = id(6);
const GOHM = 'GΩ';

let seq = 0x100;
function suggestion(targetPath: string, value: unknown, extra: Partial<SuggestionRow> = {}): SuggestionRow {
  return suggestionRowSchema.parse({
    id: id(++seq),
    relatorio_id: TEST_RELATORIO,
    target_path: targetPath,
    value,
    trust: 'suggested',
    mode: 'fill',
    source: { photo_id: PHOTO, bbox: [0.1, 0.2, 0.3, 0.4], ocr_token_ids: ['t1'], reading_run_id: RUN },
    status: 'pending',
    prompt_version: 'display-1',
    ...extra,
  });
}

const n = (raw: string, unit: string | null = GOHM) => ({ raw, unit, state: 'measured' as const });
const cell = (value: unknown, source: string | null = null): Cell => ({ value: value as Cell['value'], source_suggestion_id: source, op_id: OP });
const cellPath = (testKey: string, row: number, col: number, block = BLOCK) => `sheet/${block}/test/${testKey}/cell/${row}/${col}`;

function chave(cells: Record<string, Record<string, Record<string, Cell>>> = {}): BlockRow {
  const test: BlockRow['sheet']['test'] = {};
  for (const [key, rows] of Object.entries(cells)) test[key] = { cells: rows };
  return {
    id: BLOCK,
    relatorio_id: TEST_RELATORIO,
    location_id: CABINE,
    equipment_id: null,
    block_type: 'chave_seccionadora',
    config: {},
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), test },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

function cabine(env: Partial<Extract<LocationRow, { kind: 'cabine' }>['env']> = {}): Extract<LocationRow, { kind: 'cabine' }> {
  return {
    id: CABINE,
    relatorio_id: TEST_RELATORIO,
    parent_id: null,
    name: 'Cabine',
    order_key: 'a0',
    removed_at: null,
    kind: 'cabine',
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null, ...env },
    agrupar_por_tipo: false,
  };
}

describe('9.1-UNIT the targets of a display suggestion', () => {
  it('names a block for every sheet path and a location for an environment field', () => {
    expect(suggestionTarget(cellPath('isolacao', 0, 0))).toEqual({ kind: 'block', block_id: BLOCK });
    expect(suggestionTarget(`location/${CABINE}/env/temperature_c`)).toEqual({ kind: 'location', location_id: CABINE });
    expect(suggestionTarget(`location/${CABINE}/se/type`)).toBeNull();
    expect(suggestionTarget('nonsense')).toBeNull();
    // The sheet-only helpers stay sheet-only: an environment suggestion holds no block.
    expect(suggestionBlockId({ target_path: `location/${CABINE}/env/temperature_c` })).toBeNull();
  });

  it('keeps a live cabine environment suggestion only when the locations are given (Sync status), never in the sheet counts', () => {
    const env = suggestion(`location/${CABINE}/env/temperature_c`, n('23.4', '°C'));
    const sheet = suggestion(cellPath('isolacao', 0, 0), n('147'));
    const gone = suggestion(cellPath('isolacao', 0, 0, OTHER), n('147'));
    const blocks = [chave(), { ...chave(), id: OTHER, removed_at: '2026-09-28T10:00:00.000Z' }];
    expect(livePendingSuggestions(blocks, [env, sheet, gone])).toEqual([sheet]);
    expect(livePendingSuggestions(blocks, [env, sheet, gone], [cabine()])).toEqual([env, sheet]);
    expect(livePendingSuggestions(blocks, [env], [{ ...cabine(), removed_at: '2026-09-28T10:00:00.000Z' }])).toEqual([]);
    expect([...blocksWithPendingSuggestions([env, sheet])]).toEqual([BLOCK]);
  });
});

describe('9.1-UNIT Measurement cell suggestions', () => {
  it('fill on an empty cell, replace beside a different value, none beside an equal one; newest per cell; reading order', () => {
    const block = chave({ isolacao: { '1': { '0': cell(n('147')) }, '2': { '0': cell(n('14.7')) } } });
    const older = suggestion(cellPath('isolacao', 0, 0), n('100'));
    const rows = [
      suggestion(cellPath('resistencia_contato', 0, 0), n('87', 'µΩ')),
      suggestion(cellPath('isolacao', 2, 0), n('147')),
      older,
      suggestion(cellPath('isolacao', 0, 0), n('120')),
      suggestion(cellPath('isolacao', 1, 0), n('147.0')),
      suggestion(cellPath('isolacao', 0, 0, OTHER), n('1')),
      suggestion(cellPath('isolacao', 3, 0), n('1'), { status: 'confirmed' }),
    ];
    const entries = measurementSuggestions(block, rows);
    expect(entries.map((e) => [e.address, (e.suggestion.value as { raw: string }).raw, e.view])).toEqual([
      [{ testKey: 'isolacao', row: 0, col: 0 }, '120', 'fill'],
      [{ testKey: 'isolacao', row: 1, col: 0 }, '147.0', 'none'],
      [{ testKey: 'isolacao', row: 2, col: 0 }, '147', 'replace'],
      [{ testKey: 'resistencia_contato', row: 0, col: 0 }, '87', 'fill'],
    ]);
    expect(storedTestCell(block, { testKey: 'isolacao', row: 1, col: 0 })).toEqual(cell(n('147')));
    expect(storedTestCell(block, { testKey: 'isolacao', row: 0, col: 0 })).toBeNull();
  });

  it('"Confirmar todos" of one table takes its suggested fills only', () => {
    const block = chave({ isolacao: { '1': { '0': cell(n('14.7')) } } });
    const fill = suggestion(cellPath('isolacao', 0, 0), n('147'));
    const verify = suggestion(cellPath('isolacao', 2, 0), n('147'), { trust: 'verify' });
    const replace = suggestion(cellPath('isolacao', 1, 0), n('147'));
    const closed = suggestion(cellPath('isolacao', 3, 0), n('150'));
    const rows = [fill, verify, replace, closed];
    expect(measurementConfirmAllCandidates(block, rows, 'isolacao', 'contato_aberto')).toEqual([fill]);
    expect(measurementConfirmAllCandidates(block, rows, 'isolacao', 'contato_fechado')).toEqual([closed]);
    expect(measurementConfirmAllCandidates(block, rows, 'isolacao', 'nope')).toEqual([]);
    // Its verify count is the table's own too.
    expect(measurementTableVerifyCount(block, rows, 'isolacao', 'contato_aberto')).toBe(1);
    expect(measurementTableVerifyCount(block, rows, 'isolacao', 'contato_fechado')).toBe(0);
  });

  it('E9-Q1 "Confirmar todos" leaves out a cell that shows a dictated reading, in its count and its batch', () => {
    const block = chave({});
    const dictatedOver = suggestion(cellPath('isolacao', 0, 0), n('147'));
    const other = suggestion(cellPath('isolacao', 1, 0), n('150'));
    const verify = suggestion(cellPath('isolacao', 2, 0), n('147'), { trust: 'verify' });
    const rows = [dictatedOver, other, verify];
    expect(measurementConfirmAllCandidates(block, rows, 'isolacao', 'contato_aberto')).toEqual([dictatedOver, other]);
    expect(measurementConfirmAllCandidates(block, rows, 'isolacao', 'contato_aberto', [{ testKey: 'isolacao', row: 0, col: 0 }])).toEqual([other]);
    // Another test's address with the same row and column excludes nothing here.
    expect(measurementConfirmAllCandidates(block, rows, 'isolacao', 'contato_aberto', [{ testKey: 'resistencia_contato', row: 0, col: 0 }])).toEqual([dictatedOver, other]);
    expect(measurementTableVerifyCount(block, rows, 'isolacao', 'contato_aberto', [{ testKey: 'isolacao', row: 2, col: 0 }])).toBe(0);
    expect(measurementTableVerifyCount(block, rows, 'isolacao', 'contato_aberto')).toBe(1);
  });
});

describe('9.1-UNIT thermo-hygrometer suggestions', () => {
  it('one per environment field of the cabine, with its view', () => {
    const location = cabine({ humidity_pct: n('60', '%') });
    const temp = suggestion(`location/${CABINE}/env/temperature_c`, n('23.4', '°C'));
    const hum = suggestion(`location/${CABINE}/env/humidity_pct`, n('58', '%'));
    const elsewhere = suggestion(`location/${OTHER}/env/humidity_pct`, n('58', '%'));
    expect(envSuggestions(location, [temp, hum, elsewhere]).map((e) => [e.field, e.view])).toEqual([
      ['temperature_c', 'fill'],
      ['humidity_pct', 'replace'],
    ]);
    expect(envSuggestions(cabine({ humidity_pct: n('58.0', '%') }), [hum])[0]!.view).toBe('none');
  });
});

describe('9.1-UNIT the mismatch line', () => {
  it('reads "Visor: 147 GΩ · digitado 14,7 GΩ — Conferir" with the two values to pick', () => {
    const { text, parts } = displayMismatchText(n('14.7'), { value: n('147') });
    expect(text).toBe(`Visor: 147 ${GOHM} · digitado 14,7 ${GOHM} — Conferir`);
    expect(parts.filter((part) => part.pick !== undefined)).toEqual([
      { text: `147 ${GOHM}`, pick: 'visor' },
      { text: `14,7 ${GOHM}`, pick: 'typed' },
    ]);
    expect(displayMismatchText({ raw: '', unit: GOHM, state: 'not_measured' }, { value: n('3.3', null) }).text).toBe('Visor: 3,3 · digitado - — Conferir');
  });
});

describe('9.1-UNIT the burst', () => {
  const definition = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');

  it('walks every row of the enabled tests in sheet order, one capture cell each', () => {
    const stops = displayBurstStops(chave(), definition);
    expect(stops.map((stop) => `${stop.testKey}/${stop.tableKey}:${stop.row}:${stop.col}:${stop.rowLabel}`)).toEqual([
      'isolacao/contato_aberto:0:0:T1',
      'isolacao/contato_aberto:1:0:T3',
      'isolacao/contato_aberto:2:0:T5',
      'isolacao/contato_fechado:3:0:Fase A',
      'isolacao/contato_fechado:4:0:Fase B',
      'isolacao/contato_fechado:5:0:Fase C',
      'resistencia_contato/resistencia_contato:0:0:T1-T2',
      'resistencia_contato/resistencia_contato:1:0:T3-T4',
      'resistencia_contato/resistencia_contato:2:0:T5-T6',
    ]);
    expect(displayBurstHintText(stops[0]!)).toBe('Próxima leitura: Seccionadora contato aberto · T1');
    expect(displayBurstHintText(stops[6]!)).toBe('Próxima leitura: Ensaio de resistência ôhmica de contato · T1-T2');
    expect(displayBurstHintText(null)).toBe('Nada mais a ler nesta ficha');
    expect(displayBurstStop(stops, 7, 1)!.row).toBe(2);
    expect(displayBurstStop(stops, 7, 2)).toBeNull();
    // A disabled test is not walked.
    const noContact = displayBurstStops({ ...chave(), config: { block_type: 'chave_seccionadora', sub_blocks: { isolacao: { enabled: true } }, na_defaults: [] } as BlockRow['config'] }, definition);
    expect(noContact.every((stop) => stop.testKey === 'isolacao')).toBe(true);
  });

  it('starts at the tapped table first row no display photo targets, else its first row', () => {
    const stops = displayBurstStops(chave(), definition);
    const shot = (row: number, extra: object = {}) => ({ reading_kind: 'display' as const, reading_target: displayCellTarget(BLOCK, 'chave_seccionadora', 'isolacao', { row, col: 0 }) as JsonValue, removed_at: null, ...extra });
    expect(displayBurstStart(stops, [], BLOCK, 'isolacao', 'contato_fechado')).toBe(3);
    expect(displayBurstStart(stops, [shot(0), shot(1)], BLOCK, 'isolacao', 'contato_aberto')).toBe(2);
    expect(displayBurstStart(stops, [shot(0), shot(1), shot(2)], BLOCK, 'isolacao', 'contato_aberto')).toBe(0);
    expect(displayBurstStart(stops, [shot(0, { removed_at: '2026-09-28T10:00:00.000Z' })], BLOCK, 'isolacao', 'contato_aberto')).toBe(0);
    expect(displayBurstStart(stops, [{ ...shot(0), reading_kind: 'plate' as const }], BLOCK, 'isolacao', 'contato_aberto')).toBe(0);
    expect(displayBurstStart(stops, [], BLOCK, 'resistencia_contato', 'resistencia_contato')).toBe(6);
  });
});

describe('9.1-UNIT the queued display photos', () => {
  it('lists the start cell of each display photo still queued or running; the cabine environment apart', () => {
    const photo = (row: number, status: string, extra: object = {}) => ({
      reading_kind: 'display' as const,
      reading_target: displayCellTarget(BLOCK, 'chave_seccionadora', 'isolacao', { row, col: 0 }) as JsonValue,
      reading_status: status as 'queued',
      removed_at: null,
      ...extra,
    });
    const photos = [photo(0, 'queued'), photo(1, 'running'), photo(2, 'done'), photo(3, 'failed'), photo(4, 'queued', { removed_at: '2026-09-28T10:00:00.000Z' })];
    expect(displayQueuedCells(photos, BLOCK)).toEqual([
      { address: { testKey: 'isolacao', row: 0, col: 0 }, state: 'queued' },
      { address: { testKey: 'isolacao', row: 1, col: 0 }, state: 'running' },
    ]);
    expect(displayQueuedCells(photos, OTHER)).toEqual([]);
    const env = { reading_kind: 'display' as const, reading_target: displayEnvTarget(CABINE) as JsonValue, reading_status: 'queued' as const, removed_at: null };
    expect(displayQueuedEnv([env], CABINE)).toBe('queued');
    expect(displayQueuedEnv([{ ...env, reading_status: 'done' as const }], CABINE)).toBeNull();
    expect(displayQueuedEnv([env], OTHER)).toBeNull();
  });
});
