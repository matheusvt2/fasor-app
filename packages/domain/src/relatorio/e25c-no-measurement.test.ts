import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { section9Layout, type PrintSheet, type PrintTable, type SheetPart } from '../print/section-9.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition, getSeed, seedRule } from '../seed/definitions.ts';
import type { BlockDefinition, FieldDef } from '../seed/schema.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import {
  chosenConclusionPair,
  conclusionAdjusted,
  conclusionFloor,
  conclusionFloorReasonText,
  conclusionPairWrites,
  conclusionPreview,
  conclusionSuggestion,
  effectiveConclusionPair,
  isLooserThanFloor,
  noMeasurementRefusesAprovado,
  observationRequiredBy,
  printedConclusionPair,
  restrictionOffered,
  storedAprovadoRefused,
} from './conclusion.ts';
import { instantiateTemplate } from './instantiate.ts';
import { choiceValue, measurementCells } from './measurement-evaluation.ts';
import { derivedParecer, parecerCounts } from './parecer.ts';
import { progress } from './progress.ts';
import { evaluatedCells } from './readings.ts';
import { sheetMeasurements, sheetReadings } from './sheet-evaluation.ts';
import { sheetProgress } from './sheet-progress.ts';
import { isEquipmentBlock, sheetState } from './sheet-state.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * 25.6-UNIT (batch e25c, Story 25.6, seed v15 `no_measurement_refuses_aprovado`; M07, decision 6): a sheet
 * whose live tests hold no measured reading and at least one "Não medido" neither offers nor accepts Aprovado.
 * Over seeded tests and measurement tests, switched-off tests, a type with no test, the stored pair, the
 * progress, the printed pair and the parecer; the same inputs on v14, which concludes and prints as before.
 * Every value is invented.
 */

const id = (n: number) => `019966b0-0e25-7006-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const notMeasured = (unit: string | null) => ({ raw: '', unit, state: 'not_measured' as const });
const CONCLUDED = { actor_id: TEST_USER, at: '2026-11-12T12:00:00.000Z' };
const SENTENCE = 'Nenhum ensaio foi medido nesta ficha. Registre as medições ou marque a ficha como não ensaiada.';

function sheet(type: EquipmentBlockType, seedVersion: string): BlockRow {
  return newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: id(1),
    equipmentId: id(2),
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(4),
    type,
    tag: 'T1',
    seedVersion,
    orderKey: 'a0',
  }).block;
}

const definitionOf = (block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);

function put(block: BlockRow, testKey: string, row: number, col: number, value: unknown): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  test.cells[String(row)] = { ...test.cells[String(row)], [String(col)]: cell(value) };
  next.sheet.test[testKey] = test;
  return next;
}

/**
 * Every reading cell of the sheet's live tests written `value(unit)`: each capture and typed index of a seeded
 * table and each number cell of a measurement table; a ratio input, when `inputs` is given, takes that value; a
 * choice cell of a measurement table (the breaker's oil sampling) its first option, an answer that is not a reading.
 */
function everyReading(block: BlockRow, value: (unit: string | null) => unknown, inputs?: (unit: string | null) => unknown): BlockRow {
  const definition = definitionOf(block);
  let next = block;
  for (const one of evaluatedCells(sheetReadings(block, definition))) {
    if (one.role === 'input') {
      if (inputs !== undefined) next = put(next, one.address.testKey, one.address.row, one.address.col, inputs(one.unit));
      continue;
    }
    next = put(next, one.address.testKey, one.address.row, one.address.col, value(one.unit));
  }
  for (const one of measurementCells(sheetMeasurements(block, definition))) {
    if (one.kind === 'number') next = put(next, one.address.testKey, one.address.row, one.address.col, value(one.unit));
    else if (one.options.length > 0) next = put(next, one.address.testKey, one.address.row, one.address.col, choiceValue(one.options[0]!.key));
  }
  return next;
}

/** A plate value by kind, invented; a select takes its first option. */
function plateValue(field: FieldDef, n: number): unknown {
  switch (field.kind) {
    case 'text':
      return `E25C6-${n + 1}`;
    case 'manufacturer':
      return 'Fabricante sintético';
    case 'number':
      return measured(String(100 + n * 10), field.unit ?? null);
    case 'date':
      return '2020-03-15';
    case 'voltage_class':
      return '15';
    case 'select':
      return field.options![0]!;
  }
}

/** The plate filled and every checklist row Conforme. */
function conforming(block: BlockRow): BlockRow {
  const next = structuredClone(block);
  definitionOf(block).nameplate.forEach((field, n) => {
    // The breaker's oil medium, so its oil sampling (a choice) is live.
    next.sheet.nameplate[field.key] = cell(field.key === 'meio_de_extincao' ? 'Óleo' : plateValue(field, n));
  });
  for (const item of definitionOf(block).checklist ?? []) next.sheet.checklist[item.key] = { result: cell('C') };
  return next;
}

function stored(block: BlockRow, result: string | null, restriction: string | null): BlockRow {
  const next = structuredClone(block);
  next.sheet.conclusion.result = cell(result);
  next.sheet.conclusion.restriction = cell(restriction);
  return next;
}

const concluded = (block: BlockRow): BlockRow => ({ ...structuredClone(block), concluded_by: CONCLUDED });
const observed = (block: BlockRow, text: string): BlockRow => ({ ...structuredClone(block), sheet: { ...structuredClone(block.sheet), observations: cell(text) } });
const notTested = (block: BlockRow): BlockRow => ({ ...structuredClone(block), not_tested: { reason: 'impossibilidade_desligamento', text: null, at: '2026-11-12T12:00:00.000Z', by: TEST_USER } });

function switchedOff(block: BlockRow, subBlocks: readonly string[]): BlockRow {
  const next = structuredClone(block);
  for (const key of subBlocks) (next.config as { sub_blocks: Record<string, { enabled: boolean }> }).sub_blocks[key] = { enabled: false };
  return next;
}

/** The breaker of AC 1: every item Conforme, every reading "Não medido". */
const nothingMeasured = (version: string) => everyReading(conforming(sheet('disjuntor_mt', version)), notMeasured);

// --- a relatório -----------------------------------------------------------------------------------

function relatorioOf(seedVersion: string): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0e25-7063-8000-000000000001', seedVersion }),
    { id: TEST_PROJECT },
    { service_start: '2026-11-10', service_end: '2026-11-11', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0e25-7061-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((draft, i) => ({ ...makeOp({ ...draft, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0e25-7062-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

/** The relatório of `version` with its first breaker alone among the equipment sheets, written by `fn`. */
function breakerAlone(version: string, fn: (block: BlockRow) => BlockRow): { snapshot: RelatorioSnapshot; blockId: string } {
  const snapshot = relatorioOf(version);
  const breaker = snapshot.blocks.find((block) => block.block_type === 'disjuntor_mt' && block.removed_at === null)!;
  const blocks = snapshot.blocks.map((block) => {
    if (block.id === breaker.id) return fn(structuredClone(block));
    return isEquipmentBlock(block) ? { ...block, removed_at: '2026-11-11T10:00:00.000Z' } : block;
  });
  return { snapshot: { ...snapshot, blocks }, blockId: breaker.id };
}

const sheetsOf = (snapshot: RelatorioSnapshot): PrintSheet[] => section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS')!.subsections.flatMap((s) => s.sheets);
const texts = (table: PrintTable): string[][] => table.rows.map((row) => row.cells.map((c) => c.text));

function boxesOf(snapshot: RelatorioSnapshot, blockId: string): string[] {
  const printed = sheetsOf(snapshot).find((s) => s.blockId === blockId)!;
  const part = printed.parts.find((p): p is Extract<SheetPart, { kind: 'table' }> => p.kind === 'table' && p.table.rows[0]!.cells[0]!.text === 'CONCLUSÃO');
  return texts(part!.table)[1]!;
}

const BOXES = (aprovado: boolean, reprovado: boolean, sem: boolean, com: boolean): string[] => [
  'APROVADO',
  aprovado ? 'X' : '',
  'REPROVADO',
  reprovado ? 'X' : '',
  'SEM RESTRIÇÕES',
  sem ? 'X' : '',
  'COM RESTRIÇÕES (VER OBSERVAÇÕES)',
  com ? 'X' : '',
];

// ===================================================================================================

describe('25.6-UNIT the seed flag', () => {
  it('v15 turns on `no_measurement_refuses_aprovado` beside v14\'s flags; v14 and older read it off', () => {
    expect(seedRule('v15', 'no_measurement_refuses_aprovado')).toBe(true);
    for (const version of ['v14', 'v13', 'v5']) expect(seedRule(version, 'no_measurement_refuses_aprovado'), version).toBe(false);
    // Story 25.7 adds its own v15 flag beside this one (`seed.test.ts` pins the whole list).
    expect(getSeed('v15', 'cabine_primaria').rules).toMatchObject({ ...getSeed('v14', 'cabine_primaria').rules, no_measurement_refuses_aprovado: true });
  });
});

describe('25.6-UNIT a v15 sheet with no measurement neither offers nor accepts Aprovado', () => {
  it('AC 1: a breaker with every item Conforme and every reading "Não medido": Aprovado disabled with the reason line, no floor, nothing suggested or previewed', () => {
    const block = nothingMeasured('v15');
    expect(evaluatedCells(sheetReadings(block, definitionOf(block))).filter((one) => one.role === 'capture').length).toBeGreaterThan(0);
    // The oil sampling's answer (a choice) is written: a pass or fail answer is not a reading.
    expect(measurementCells(sheetMeasurements(block, definitionOf(block))).some((one) => one.kind === 'choice' && one.raw !== '')).toBe(true);
    expect(noMeasurementRefusesAprovado(block)).toBe(true);
    expect(conclusionFloor(block)).toBeNull();
    expect(isLooserThanFloor(block, 'aprovado')).toBe(true);
    expect(isLooserThanFloor(block, 'reprovado')).toBe(false);
    expect(conclusionFloorReasonText(block)).toBe(SENTENCE);
    expect(conclusionSuggestion(block)).toBeNull();
    expect(conclusionPreview(block)).toEqual({ result: false, restriction: false });
    expect(effectiveConclusionPair(block)).toEqual({ result: null, restriction: null });
    // No Restrições group: the only result left is Reprovado, which takes none.
    expect(restrictionOffered(block, null)).toBe(false);
    // The Ensaios step is complete ("Não medido" fills a cell); the Conclusão step misses its result alone.
    const p = sheetProgress({ blocks: [block] }, block.id);
    expect(p.steps.ensaios.missing).toBe(0);
    expect(p.steps.conclusao.missing).toBe(1);
    expect(p.firstIncompleteStep).toBe('conclusao');
    // "Concluir ficha" has nothing to write for the pair, so the conclude stops at the step.
    expect(sheetProgress({ blocks: [block] }, block.id, { floorFills: true }).complete).toBe(false);
    expect(conclusionPairWrites(block)).toEqual({ result: null, restriction: null, clearRestriction: false });
  });

  it('a tap on Aprovado is not accepted: the stored Aprovado reads as no result; Reprovado is accepted, with OBSERVAÇÕES required as on v14', () => {
    const tapped = stored(nothingMeasured('v15'), 'aprovado', null);
    expect(effectiveConclusionPair(tapped)).toEqual({ result: null, restriction: null });
    expect(chosenConclusionPair(tapped)).toEqual({ result: null, restriction: null });
    expect(sheetProgress({ blocks: [tapped] }, tapped.id).steps.conclusao.missing).toBe(1);
    const reproved = stored(nothingMeasured('v15'), 'reprovado', null);
    expect(noMeasurementRefusesAprovado(reproved)).toBe(true);
    expect(effectiveConclusionPair(reproved)).toEqual({ result: 'reprovado', restriction: null });
    expect(observationRequiredBy(reproved)).toBe('reprovado');
    expect(sheetProgress({ blocks: [reproved] }, reproved.id).steps.conclusao).toMatchObject({ missing: 1, observation: 1 });
    const justified = observed(reproved, 'Ensaios não realizados pelo técnico.');
    expect(sheetProgress({ blocks: [justified] }, justified.id).complete).toBe(true);
    // Reprovado by hand is not turned Aprovado or anything else by itself.
    expect(printedConclusionPair(justified)).toEqual({ result: 'reprovado', restriction: null });
  });

  it('AC 2: marked not tested, the rule no longer applies; the sheet is done with and counts under "Não ensaiadas"', () => {
    const marked = notTested(nothingMeasured('v15'));
    expect(noMeasurementRefusesAprovado(marked)).toBe(false);
    expect(conclusionFloorReasonText(marked)).toBeNull();
    expect(sheetState(marked)).toBe('nao_ensaiada');
    expect(sheetProgress({ blocks: [marked] }, marked.id).complete).toBe(true);
    const { snapshot } = breakerAlone('v15', (block) => notTested(everyReading(conforming(block), notMeasured)));
    expect(progress(snapshot)).toMatchObject({ not_tested: 1, sheets_handled: 1, sheets_concluded: 0, sheets_total: 1 });
  });

  it('AC 3: a sheet concluded Aprovado whose last measured reading becomes "Não medido" reads as not concluded, counts incomplete and prints no result; nothing is written', () => {
    const measuredFirst = (block: BlockRow) => {
      const definition = definitionOf(block);
      const first = evaluatedCells(sheetReadings(block, definition)).find((one) => one.role === 'capture')!;
      return { block: put(block, first.address.testKey, first.address.row, first.address.col, measured('12', first.unit)), first };
    };
    const closed = (block: BlockRow) => concluded(stored(block, 'aprovado', 'sem_restricoes'));
    // Before: one reading measured, concluded Aprovado · Sem restrições.
    const before = (() => {
      const { block } = measuredFirst(nothingMeasured('v15'));
      return closed(block);
    })();
    expect(noMeasurementRefusesAprovado(before)).toBe(false);
    expect(effectiveConclusionPair(before)).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    expect(sheetState(before)).toBe('concluida');
    // After: that reading "Não medido".
    const after = closed(nothingMeasured('v15'));
    expect(storedAprovadoRefused(after)).toBe(true);
    expect(effectiveConclusionPair(after)).toEqual({ result: null, restriction: null });
    expect(chosenConclusionPair(after)).toEqual({ result: null, restriction: null });
    expect(printedConclusionPair(after)).toEqual({ result: null, restriction: null });
    // Not "adjusted": no Confirmar offers to write anything.
    expect(conclusionAdjusted(after)).toBe(false);
    expect(sheetProgress({ blocks: [after] }, after.id)).toMatchObject({ complete: false, firstIncompleteStep: 'conclusao' });
    expect(sheetState(after)).toBe('em_preenchimento');
    // The stored values stay as written.
    expect(after.sheet.conclusion.result?.value).toBe('aprovado');
    expect(after.concluded_by).toEqual(CONCLUDED);

    const { snapshot, blockId } = breakerAlone('v15', (block) => closed(everyReading(conforming(block), notMeasured)));
    expect(progress(snapshot)).toMatchObject({ sheets_concluded: 0, sheets_handled: 0, sheets_total: 1 });
    expect(boxesOf(snapshot, blockId)).toEqual(BOXES(false, false, false, false));
    // The parecer counts it as a sheet with no conclusion: nothing judged, no verdict, none concluded.
    expect(derivedParecer(snapshot)).toBeNull();
    expect(parecerCounts(snapshot)).toMatchObject({ concluded: 0 });
    // Reproved by the technician, the sheet is concluded again and prints REPROVADO.
    const reproved = breakerAlone('v15', (block) => concluded(observed(stored(everyReading(conforming(block), notMeasured), 'reprovado', null), 'Sem medição.')));
    expect(sheetState(reproved.snapshot.blocks.find((block) => block.id === reproved.blockId)!)).toBe('concluida');
    expect(boxesOf(reproved.snapshot, reproved.blockId)).toEqual(BOXES(false, true, false, false));
    expect(derivedParecer(reproved.snapshot)).toBe('nao_apto');
  });

  it('AC 4: one test measured and another all "Não medido": Aprovado is accepted (the rule is about a sheet with no measurement at all)', () => {
    let block = nothingMeasured('v15');
    const definition = definitionOf(block);
    const contact = evaluatedCells(sheetReadings(block, definition)).filter((one) => one.role === 'capture' && one.address.testKey === 'resistencia_contato');
    expect(contact.length).toBeGreaterThan(0);
    for (const one of contact) block = put(block, one.address.testKey, one.address.row, one.address.col, measured('30', 'µΩ'));
    expect(noMeasurementRefusesAprovado(block)).toBe(false);
    expect(isLooserThanFloor(block, 'aprovado')).toBe(false);
    expect(conclusionFloor(block)?.pair).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    expect(effectiveConclusionPair(stored(block, 'aprovado', 'sem_restricoes'))).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
  });

  it('a reading above the instrument\'s limit is a value: the rule does not apply', () => {
    const block = nothingMeasured('v15');
    const insulation = evaluatedCells(sheetReadings(block, definitionOf(block))).find((one) => one.role === 'capture' && one.overRange.allowed)!;
    const over = put(block, insulation.address.testKey, insulation.address.row, insulation.address.col, { raw: '5', unit: 'TΩ', state: 'over_range' });
    expect(noMeasurementRefusesAprovado(over)).toBe(false);
  });

  it('a cell left empty beside "Não medido" cells: still no measurement (an empty cell is missing, not a value)', () => {
    const block = nothingMeasured('v15');
    const first = evaluatedCells(sheetReadings(block, definitionOf(block))).find((one) => one.role === 'capture')!;
    const emptied = structuredClone(block);
    delete emptied.sheet.test[first.address.testKey]!.cells[String(first.address.row)]![String(first.address.col)];
    expect(noMeasurementRefusesAprovado(emptied)).toBe(true);
    expect(sheetProgress({ blocks: [emptied] }, emptied.id).steps.ensaios.missing).toBe(1);
  });

  it('AC 5: every test switched off, or a type with no test (the No-break de comando): Aprovado accepted as today', () => {
    const block = nothingMeasured('v15');
    const tests = [...definitionOf(block).tests.map((test) => test.key), ...(definitionOf(block).measurement_tests ?? []).map((test) => test.key)];
    const off = switchedOff(block, tests);
    expect(noMeasurementRefusesAprovado(off)).toBe(false);
    expect(isLooserThanFloor(off, 'aprovado')).toBe(false);
    expect(conclusionFloor(off)?.pair).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    const noBreak = conforming(sheet('no_break_comando', 'v15'));
    expect(definitionOf(noBreak).tests).toEqual([]);
    expect(noMeasurementRefusesAprovado(noBreak)).toBe(false);
    expect(isLooserThanFloor(noBreak, 'aprovado')).toBe(false);
  });

  it('a measurement test counts as a seeded one: the Malha de aterramento with every continuity reading "Não medido", then one measured', () => {
    const grid = everyReading(conforming(sheet('malha_aterramento', 'v15')), notMeasured);
    const cells = measurementCells(sheetMeasurements(grid, definitionOf(grid))).filter((one) => one.kind === 'number');
    expect(cells.length).toBeGreaterThan(0);
    expect(noMeasurementRefusesAprovado(grid)).toBe(true);
    expect(isLooserThanFloor(grid, 'aprovado')).toBe(true);
    const one = cells[0]!;
    const measuredOne = put(grid, one.address.testKey, one.address.row, one.address.col, measured('0.5', one.unit));
    expect(noMeasurementRefusesAprovado(measuredOne)).toBe(false);
  });

  it('a ratio input typed is not a reading: a TP whose captures are all "Não medido" has no measurement', () => {
    const tp = everyReading(conforming(sheet('tp', 'v15')), notMeasured, (unit) => measured('13800', unit));
    expect(evaluatedCells(sheetReadings(tp, definitionOf(tp))).some((one) => one.role === 'input')).toBe(true);
    expect(noMeasurementRefusesAprovado(tp)).toBe(true);
  });
});

describe('25.6-UNIT the same inputs on v14 conclude and print as before', () => {
  it('every reading "Não medido": the Aprovado · Sem restrições floor, Aprovado offered, no reason line, the restriction asked', () => {
    const block = nothingMeasured('v14');
    expect(noMeasurementRefusesAprovado(block)).toBe(false);
    expect(conclusionFloor(block)).toEqual({ pair: { result: 'aprovado', restriction: 'sem_restricoes' }, reasons: [] });
    expect(isLooserThanFloor(block, 'aprovado')).toBe(false);
    expect(conclusionFloorReasonText(block)).toBeNull();
    expect(conclusionSuggestion(block)).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    expect(restrictionOffered(block, null)).toBe(true);
    expect(sheetProgress({ blocks: [block] }, block.id).steps.conclusao.missing).toBe(2);
  });

  it('concluded Aprovado: it stays concluded, counts concluded and prints APROVADO and SEM', () => {
    const after = concluded(stored(nothingMeasured('v14'), 'aprovado', 'sem_restricoes'));
    expect(storedAprovadoRefused(after)).toBe(false);
    expect(effectiveConclusionPair(after)).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    expect(sheetState(after)).toBe('concluida');
    const { snapshot, blockId } = breakerAlone('v14', (block) => concluded(stored(everyReading(conforming(block), notMeasured), 'aprovado', 'sem_restricoes')));
    expect(progress(snapshot)).toMatchObject({ sheets_concluded: 1, sheets_handled: 1 });
    expect(boxesOf(snapshot, blockId)).toEqual(BOXES(true, false, true, false));
    expect(derivedParecer(snapshot)).toBe('apto');
  });
});
