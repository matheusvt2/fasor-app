import { describe, expect, it } from 'vitest';
import type { BlockRow, Cell, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import type { WordRow } from '../registry/word-row.ts';
import { TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import {
  appendObservation,
  cabineOf,
  checklistUnsetItems,
  fieldValueText,
  humidityNoteSurfaced,
  insertPhrase,
  isCabineFirstSheet,
  itensMarcadosConformeText,
  lastNotTestedReason,
  nameplateWordRecents,
  nextSheet,
  numberFieldValue,
  previousCabineEnv,
  quickNotes,
  recentChecklistObservations,
  repeatChecklistPattern,
  repeatChecklistSource,
  sheetOrder,
} from './ficha.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * 5.1-5.4-UNIT: the rules the equipment sheet reads, over a small hand-built relatório:
 * cabine A (one block of its own, coluna 1 with two blocks), cabine B (coluna 2 with one).
 */

const id = (n: number) => `019966b0-0053-7000-8000-${n.toString(16).padStart(12, '0')}`;
const num = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });

const cabine = (n: number, name: string, order_key: string, env: Partial<Extract<LocationRow, { kind: 'cabine' }>['env']> = {}): LocationRow => ({
  id: id(n),
  relatorio_id: TEST_RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name,
  order_key,
  removed_at: null,
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null, ...env },
  agrupar_por_tipo: false,
});

const coluna = (n: number, name: string, parent: number, order_key: string): LocationRow => ({
  id: id(n),
  relatorio_id: TEST_RELATORIO,
  parent_id: id(parent),
  kind: 'coluna',
  name,
  order_key,
  removed_at: null,
});

function sheet(n: number, location: number, tag: string, order_key: string): { block: BlockRow; equipment: EquipmentRow } {
  return newEquipmentBlock({
    blockId: id(1000 + n),
    equipmentId: id(2000 + n),
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(location),
    type: 'chave_seccionadora',
    tag,
    seedVersion: 'v1',
    orderKey: order_key,
    config: { block_type: 'chave_seccionadora', subtype: 'manual', sub_blocks: {}, na_defaults: ['motor', 'fusiveis'] },
  });
}

const cell = (value: unknown, op: number = 9000): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(op) });

function relatorio() {
  const locations = [cabine(1, 'Cabine A', 'a0'), coluna(2, 'Coluna 1', 1, 'a0'), cabine(3, 'Cabine B', 'a1', { temperature_c: num('19', '°C'), humidity_pct: num('85', '%') }), coluna(4, 'Coluna 2', 3, 'a0')];
  const sheets = [sheet(1, 1, 'SEC-A', 'a0'), sheet(2, 2, 'SEC-C1', 'a0'), sheet(3, 2, 'SEC-C2', 'a1'), sheet(4, 4, 'SEC-C3', 'a0')];
  return { locations, blocks: sheets.map((s) => s.block), equipment: sheets.map((s) => s.equipment) };
}

describe('5.1-UNIT tree order and the next sheet', () => {
  it('walks the tree: a cabine own blocks, then its colunas', () => {
    expect(sheetOrder(relatorio()).map((node) => node.tag)).toEqual(['SEC-A', 'SEC-C1', 'SEC-C2', 'SEC-C3']);
  });

  it('names a jump to another location "coluna" and the last sheet "relatorio"', () => {
    const r = relatorio();
    expect(nextSheet(r, id(1001))).toEqual({ kind: 'coluna', blockId: id(1002) });
    expect(nextSheet(r, id(1002))).toEqual({ kind: 'ficha', blockId: id(1003) });
    expect(nextSheet(r, id(1003))).toEqual({ kind: 'coluna', blockId: id(1004) });
    expect(nextSheet(r, id(1004))).toEqual({ kind: 'relatorio' });
    expect(nextSheet(r, id(9999))).toEqual({ kind: 'relatorio' });
  });
});

describe('5.2-UNIT the cabine block', () => {
  it('finds the cabine above a coluna and tells its first sheet', () => {
    const r = relatorio();
    expect(cabineOf(r.locations, id(2))?.id).toBe(id(1));
    expect(cabineOf(r.locations, id(1))?.id).toBe(id(1));
    expect(cabineOf(r.locations, null)).toBeNull();
    expect(isCabineFirstSheet(r, id(1001))).toBe(true);
    expect(isCabineFirstSheet(r, id(1002))).toBe(false);
    expect(isCabineFirstSheet(r, id(1004))).toBe(true);
  });

  it('copies the environment of the previous root cabine only when it holds both values', () => {
    const r = relatorio();
    expect(previousCabineEnv(r.locations, id(1))).toBeNull();
    expect(previousCabineEnv(r.locations, id(3))).toBeNull();
    const withEnv = [cabine(1, 'Cabine A', 'a0', { temperature_c: num('19', '°C'), humidity_pct: num('67', '%') }), ...r.locations.slice(1)];
    expect(previousCabineEnv(withEnv, id(3))).toEqual({ cabineId: id(1), name: 'Cabine A', temperature_c: num('19', '°C'), humidity_pct: num('67', '%') });
    const onlyOne = [cabine(1, 'Cabine A', 'a0', { temperature_c: num('19', '°C') }), ...r.locations.slice(1)];
    expect(previousCabineEnv(onlyOne, id(3))).toBeNull();
  });

  it('surfaces the humidity note above the threshold only', () => {
    expect(humidityNoteSurfaced({ humidity_pct: num('85', '%') })).toBe(true);
    expect(humidityNoteSurfaced({ humidity_pct: num('80', '%') })).toBe(false);
    expect(humidityNoteSurfaced({ humidity_pct: null })).toBe(false);
    expect(humidityNoteSurfaced(null)).toBe(false);
    expect(quickNotes('v1')[0]).toContain('umidade');
    expect(appendObservation(null, 'Nota.')).toBe('Nota.');
    expect(appendObservation('Texto', 'Nota.')).toBe('Texto\n\nNota.');
    expect(appendObservation('Texto\n\nNota.', 'Nota.')).toBe('Texto\n\nNota.');
  });
});

describe('5.4-UNIT the checklist', () => {
  it('bulk C targets the unset rows only (NC and NA defaults untouched)', () => {
    const [block] = relatorio().blocks;
    const b = { ...block!, sheet: { ...block!.sheet, checklist: { contatos: { result: cell('NC') }, isoladores: { result: cell('C') } } } };
    const unset = checklistUnsetItems(b);
    expect(unset).not.toContain('contatos');
    expect(unset).not.toContain('isoladores');
    expect(unset).not.toContain('motor');
    expect(unset).not.toContain('fusiveis');
    expect(unset).toHaveLength(14 - 4);
    expect(itensMarcadosConformeText(11)).toBe('11 itens marcados Conforme');
    expect(itensMarcadosConformeText(1)).toBe('1 item marcado Conforme');
  });

  it('repeats the pattern of the last concluded same-type sheet, the target unset rows only', () => {
    const r = relatorio();
    const [a, b, c, target] = r.blocks;
    const concluded = (row: BlockRow, at: string, checklist: BlockRow['sheet']['checklist']): BlockRow => ({ ...row, concluded_by: { actor_id: 'u1', at }, sheet: { ...row.sheet, checklist } });
    const older = concluded(a!, '2026-09-06T10:00:00.000Z', { contatos: { result: cell('C') } });
    const newer = concluded(b!, '2026-09-06T11:00:00.000Z', { contatos: { result: cell('NC'), observation: cell('oxidação') }, isoladores: { result: cell('C') } });
    const snapshot = { blocks: [older, newer, c!, target!] };
    expect(repeatChecklistSource(snapshot, target!.id)?.id).toBe(newer.id);
    const pattern = repeatChecklistPattern(newer, target!);
    expect(pattern).toContainEqual({ itemKey: 'contatos', value: 'NC' });
    expect(pattern).toContainEqual({ itemKey: 'isoladores', value: 'C' });
    // Both sheets show NA on their `na_defaults`: nothing to write there.
    expect(pattern.some((entry) => entry.itemKey === 'motor')).toBe(false);
    expect(pattern).toHaveLength(2);
    expect(repeatChecklistSource({ blocks: [c!, target!] }, target!.id)).toBeNull();

    // The target already answered `contatos` (differently from the source): "Repetir"
    // must leave it as is, the same rule as "Marcar os restantes como Conforme".
    const answeredTarget = { ...target!, sheet: { ...target!.sheet, checklist: { contatos: { result: cell('C') } } } };
    const patternOverAnswered = repeatChecklistPattern(newer, answeredTarget);
    expect(patternOverAnswered.some((entry) => entry.itemKey === 'contatos')).toBe(false);
    expect(patternOverAnswered).toContainEqual({ itemKey: 'isoladores', value: 'C' });
  });

  it('lastNotTestedReason: null with nothing marked, else the latest by `at`', () => {
    const r = relatorio();
    const [a, b] = r.blocks;
    expect(lastNotTestedReason(r.blocks)).toBeNull();
    const marked = [
      { ...a!, not_tested: { reason: 'solicitacao_cliente', text: null, at: '2026-09-06T10:00:00.000Z', by: 'u1' } },
      { ...b!, not_tested: { reason: 'impossibilidade_desligamento', text: null, at: '2026-09-06T11:00:00.000Z', by: 'u1' } },
    ];
    expect(lastNotTestedReason(marked)).toBe('impossibilidade_desligamento');
    expect(lastNotTestedReason([{ ...a!, removed_at: '2026-09-06T12:00:00.000Z', not_tested: { reason: 'outro', text: 'x', at: '2026-09-06T12:00:00.000Z', by: 'u1' } }])).toBeNull();
  });

  it('offers the five most recent typed observations of an item, newest first, without the seeded phrases or repeats', () => {
    const r = relatorio();
    const withObs = (row: BlockRow, text: string, op: number): BlockRow => ({ ...row, sheet: { ...row.sheet, checklist: { contatos: { result: cell('NC'), observation: cell(text, op) } } } });
    const blocks = [
      withObs(r.blocks[0]!, 'oxidação', 1),
      withObs(r.blocks[1]!, 'contato queimado', 2),
      withObs(r.blocks[2]!, 'contato queimado', 3),
      withObs(r.blocks[3]!, 'pitting leve', 4),
    ];
    expect(recentChecklistObservations({ blocks }, 'contatos', ['oxidação'])).toEqual(['pitting leve', 'contato queimado']);
    expect(recentChecklistObservations({ blocks }, 'isoladores')).toEqual([]);
  });

  it('inserts a chip phrase at the caret without duplicating it', () => {
    expect(insertPhrase('', 'oxidação')).toEqual({ text: 'oxidação', caret: 8 });
    expect(insertPhrase('contatos com', 'oxidação')).toEqual({ text: 'contatos com, oxidação', caret: 22 });
    expect(insertPhrase('contatos com ', 'oxidação')).toEqual({ text: 'contatos com oxidação', caret: 21 });
    expect(insertPhrase('oxidação', 'oxidação').text).toBe('oxidação');
    expect(insertPhrase('a b', 'x', 1).text).toBe('a, x b');
  });
});

describe('5.3-UNIT typed values (AR-10)', () => {
  it('numbers parse pt-BR into {raw, unit, state}', () => {
    expect(numberFieldValue('13,8', 'kV')).toEqual({ raw: '13.8', unit: 'kV', state: 'measured' });
    expect(numberFieldValue('3.300', 'V')).toEqual({ raw: '3300', unit: 'V', state: 'measured' });
    expect(numberFieldValue('  ', 'kV')).toBeNull();
    expect(numberFieldValue('abc', 'kV')).toBe('invalid');
  });

  it('shows a stored value the way a field reads it', () => {
    expect(fieldValueText({ kind: 'number' }, { raw: '13.8', unit: 'kV', state: 'measured' })).toBe('13,8');
    expect(fieldValueText({ kind: 'date' }, '2012-03-01')).toBe('01/03/2012');
    expect(fieldValueText({ kind: 'text' }, 'SU1')).toBe('SU1');
    expect(fieldValueText({ kind: 'text' }, null)).toBe('');
  });
});

describe('5.3-UNIT nameplate registry chips', () => {
  it('orders the current value, then the values used on this relatório newest first, then the registry, up to five', () => {
    const word = (n: number, name: string): WordRow => ({ id: id(5000 + n), kind: 'manufacturer', name, gender: null, number: null, removed_at: null });
    const rows = [word(1, 'ABB'), word(2, 'Celtta'), word(3, 'Schneider'), word(4, 'Siemens'), word(5, 'WEG'), word(6, 'Zeta'), { ...word(7, 'Removida'), removed_at: '2026-09-01T00:00:00.000Z' }];
    const r = relatorio();
    const withMaker = (row: BlockRow, name: string, op: number): BlockRow => ({ ...row, sheet: { ...row.sheet, nameplate: { fabricacao: cell(name, op) } } });
    const blocks = [withMaker(r.blocks[0]!, 'WEG', 1), withMaker(r.blocks[1]!, 'Schneider', 2)];
    expect(nameplateWordRecents('Zeta', blocks, 'manufacturer', rows)).toEqual([id(5006), id(5003), id(5005), id(5001), id(5002)]);
    expect(nameplateWordRecents(null, [], 'manufacturer', rows)).toHaveLength(5);
    expect(nameplateWordRecents(null, [], 'manufacturer', rows)).not.toContain(id(5007));
  });
});
