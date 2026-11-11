import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { ncRowPointPositions } from '../points/checks.ts';
import { resolvedOriginPoints } from '../points/derived.ts';
import { sectionEightEntries } from '../points/summary.ts';
import { layoutSpec } from '../print/layout.ts';
import { referenceAcrossRuns, section10Layout, type LayoutSection10 } from '../print/section-10.ts';
import { section9Layout, type PrintSheet, type PrintTable, type SheetPart } from '../print/section-9.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, PointRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, EMPTY_DEFINITION_CONTEXT, getDefinition, snapshotDefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { standardTemplate } from '../seed/template.ts';
import { listPtBr } from '../text/plural.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import {
  chosenConclusionPair,
  composeConclusion,
  conclusionAdjusted,
  conclusionAdjustWrites,
  conclusionFloor,
  conclusionFloorReasonText,
  conclusionPairComplete,
  conclusionPairWrites,
  conclusionPreview,
  conclusionSuggestion,
  conclusionSuggestionText,
  conclusionTextOnConclude,
  effectiveConclusionPair,
  findingClauses,
  isConclusionPairComplete,
  isLooserThanFloor,
  markRestrictionOffered,
  observationRequired,
  observationRequiredBy,
  printedConclusionPair,
  printedConclusionText,
  restrictionApplies,
  resultChoiceWrites,
} from './conclusion.ts';
import { instantiateTemplate } from './instantiate.ts';
import { composeParecer, derivedParecer, parecerCounts, parecerTextState } from './parecer.ts';
import { cellAddressesOf, type TestKey } from './readings.ts';
import { failedPrerequisites, prerequisiteFailure } from './restriction.ts';
import { sheetProgress } from './sheet-progress.ts';
import { isEquipmentBlock } from './sheet-state.ts';
import { newEquipmentBlock } from './tree.ts';
import { visitContextOf } from './visit-context.ts';

/*
 * Batch e24a (Stories 24.3 and 24.4, seed v14; Bruno's answers 25, 26 and 28, Matheus's decisions 1,
 * 3 and 5 of 2026-11-10): every row of the spec's I/O matrix (B-1 to B-12, C-1 to C-7) on a v14 sheet
 * and, beside it, on v13, where each function answers as before. Every value is invented.
 */

const id = (n: number) => `019966b0-0e24-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const CONCLUDED = { actor_id: TEST_USER, at: '2026-11-11T12:00:00.000Z' };

// --- one sheet ---------------------------------------------------------------------------------

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

function readings(block: BlockRow, testKey: string, cells: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(cells)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  next.sheet.test[testKey] = test;
  return next;
}

/** Every capture cell of a test holding `raw` in `unit` (the cable's 1 MINUTO, the breaker's VALORES). */
function everyCapture(block: BlockRow, testKey: TestKey, raw: string, unit: string): BlockRow {
  const cells: Record<string, unknown> = {};
  for (const address of cellAddressesOf(definitionOf(block), testKey)) cells[`${address.row}/${address.col}`] = measured(raw, unit);
  return readings(block, testKey, cells);
}

/** Every checklist row Conforme, then the given rows with their result and observation. */
function checklist(block: BlockRow, rows: Record<number, { result: string; observation?: string }> = {}): BlockRow {
  const next = structuredClone(block);
  definitionOf(block).checklist!.forEach((item, n) => {
    const row = rows[n] ?? { result: 'C' };
    next.sheet.checklist[item.key] = { result: cell(row.result), ...(row.observation === undefined ? {} : { observation: cell(row.observation) }) };
  });
  return next;
}

function plate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  for (const [key, value] of Object.entries(values)) next.sheet.nameplate[key] = cell(value);
  return next;
}

/** The stored pair as the fold leaves it: a half written null (or never written) holds no cell value. */
function stored(block: BlockRow, result: string | null, restriction: string | null): BlockRow {
  const next = structuredClone(block);
  next.sheet.conclusion.result = cell(result);
  next.sheet.conclusion.restriction = cell(restriction);
  return next;
}

function observations(block: BlockRow, text: string): BlockRow {
  return { ...structuredClone(block), sheet: { ...structuredClone(block.sheet), observations: cell(text) } };
}

function switchedOff(block: BlockRow, subBlock: string): BlockRow {
  const next = structuredClone(block);
  (next.config as { sub_blocks: Record<string, { enabled: boolean }> }).sub_blocks[subBlock] = { enabled: false };
  return next;
}

/** A cable whose insulation reads 300 MΩ on every phase (criterion > 400 MΩ), every row Conforme: B-1's sheet. */
const outCable = (version: string) => everyCapture(checklist(sheet('cabos_entrada', version)), 'isolacao', '300', 'MΩ');
/** The same cable within its criterion: a clean floor. */
const cleanCable = (version: string) => everyCapture(checklist(sheet('cabos_entrada', version)), 'isolacao', '1000', 'MΩ');

// --- a relatório -----------------------------------------------------------------------------------

/** A fresh relatório of the standard template on `seedVersion`. */
function relatorioOf(seedVersion: string): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0e24-7003-8000-000000000001', seedVersion }),
    { id: TEST_PROJECT },
    { service_start: '2026-11-03', service_end: '2026-11-04', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0e24-7001-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((draft, i) => ({ ...makeOp({ ...draft, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0e24-7002-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const firstOf = (snapshot: RelatorioSnapshot, type: string): BlockRow => snapshot.blocks.find((block) => block.block_type === type && block.removed_at === null)!;
const tagOfBlock = (snapshot: RelatorioSnapshot, block: BlockRow): string => snapshot.equipment.find((row) => row.id === block.equipment_id)!.tag;

/** The snapshot with one block replaced by `edit`'s copy. */
function edit(snapshot: RelatorioSnapshot, blockId: string, fn: (block: BlockRow) => BlockRow): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === blockId ? fn(structuredClone(block)) : block)) };
}

/** The snapshot with every equipment sheet but `keep` removed, so the parecer reads those alone. */
function only(snapshot: RelatorioSnapshot, keep: readonly string[]): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (isEquipmentBlock(block) && !keep.includes(block.id) ? { ...block, removed_at: '2026-11-11T10:00:00.000Z' } : block)) };
}

// --- section 9's CONCLUSÃO row ----------------------------------------------------------------------

const sheetsOf = (snapshot: RelatorioSnapshot): PrintSheet[] => section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS')!.subsections.flatMap((s) => s.sheets);
const texts = (table: PrintTable): string[][] => table.rows.map((row) => row.cells.map((c) => c.text));

function conclusionTable(snapshot: RelatorioSnapshot, blockId: string): string[][] {
  const printed = sheetsOf(snapshot).find((s) => s.blockId === blockId)!;
  const part = printed.parts.find((p): p is Extract<SheetPart, { kind: 'table' }> => p.kind === 'table' && p.table.rows[0]!.cells[0]!.text === 'CONCLUSÃO');
  return texts(part!.table);
}

/** The boxes row of a CONCLUSÃO table, with an X on each marked box. */
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
// Story 24.3
// ===================================================================================================

describe('24.3-UNIT B-1 a v14 reading out of its criterion floors Reprovado and nothing else; v13 as before', () => {
  it('v14: floor Reprovado with no restriction, reasons ["reading"], the reason line without "Com restrições", Aprovado looser, the observation required, no restriction offered', () => {
    const block = outCable('v14');
    expect(conclusionFloor(block)).toEqual({ pair: { result: 'reprovado', restriction: null }, reasons: ['reading'] });
    expect(conclusionFloorReasonText(block)).toBe('A ficha exige no mínimo Reprovado: leitura fora do critério.');
    expect(isLooserThanFloor(block, 'aprovado')).toBe(true);
    expect(isLooserThanFloor(block, 'reprovado')).toBe(false);
    // No restriction to choose, so none is looser.
    expect(isLooserThanFloor(block, 'sem_restricoes')).toBe(false);
    expect(isLooserThanFloor(block, 'com_restricoes')).toBe(false);
    expect(effectiveConclusionPair(block)).toEqual({ result: 'reprovado', restriction: null });
    expect(restrictionApplies(block, 'reprovado')).toBe(false);
    expect(restrictionApplies(block, 'aprovado')).toBe(true);
    expect(observationRequired(block)).toBe(true);
    expect(observationRequiredBy(block)).toBe('reprovado');
    expect(conclusionSuggestion(block)).toEqual({ result: 'reprovado', restriction: null });
    expect(conclusionSuggestionText(conclusionSuggestion(block)!)).toBe('Reprovado?');
    expect(conclusionPairComplete(block)).toBe(true);
    expect(markRestrictionOffered(block)).toBe(false);
  });

  it('Story 24.5\'s preview agrees: on v14 the Reprovado floor previews the result alone ("Reprovado?"), no restriction half; on v13 both halves, as e24b built it', () => {
    const v14 = outCable('v14');
    expect(conclusionPreview(v14)).toEqual({ result: true, restriction: false });
    expect(conclusionSuggestion(v14)).toEqual({ result: 'reprovado', restriction: null });
    expect(conclusionSuggestionText(conclusionSuggestion(v14)!)).toBe('Reprovado?');
    // Reprovado stored by a tap: nothing left to preview on v14; v13 previews its Com restrições.
    expect(conclusionPreview(stored(v14, 'reprovado', null))).toEqual({ result: false, restriction: false });
    const v13 = outCable('v13');
    expect(conclusionPreview(v13)).toEqual({ result: true, restriction: true });
    expect(conclusionSuggestionText(conclusionSuggestion(v13)!)).toBe('Reprovado · Com restrições?');
    expect(conclusionPreview(stored(v13, 'reprovado', null))).toEqual({ result: false, restriction: true });
    // An Aprovado floor on v14 previews both halves, as on every seed.
    expect(conclusionPreview(cleanCable('v14'))).toEqual({ result: true, restriction: true });
  });

  it('nothing stored: the header counts the result alone missing on v14 (the Reprovado the screen shows takes no restriction); two on v13, as before', () => {
    const v14 = outCable('v14');
    expect(chosenConclusionPair(v14)).toEqual({ result: null, restriction: null });
    expect(sheetProgress({ blocks: [v14] }, v14.id).steps.conclusao.missing).toBe(1);
    const v13 = outCable('v13');
    expect(sheetProgress({ blocks: [v13] }, v13.id).steps.conclusao.missing).toBe(2);
  });

  it('v13: Reprovado · Com restrições, the reason line and suggestion as before, Sem restrições looser, "Marcar Com restrições" offered', () => {
    const block = outCable('v13');
    expect(conclusionFloor(block)).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['reading'] });
    expect(conclusionFloorReasonText(block)).toBe('A ficha exige no mínimo Reprovado · Com restrições: leitura fora do critério.');
    expect(isLooserThanFloor(block, 'sem_restricoes')).toBe(true);
    expect(effectiveConclusionPair(block)).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
    expect(restrictionApplies(block, 'reprovado')).toBe(true);
    expect(observationRequiredBy(block)).toBe('com_restricoes');
    expect(conclusionSuggestionText(conclusionSuggestion(block)!)).toBe('Reprovado · Com restrições?');
    expect(markRestrictionOffered(block)).toBe(true);
  });
});

describe('24.3-UNIT B-2 the v14 conclude of an out reading: Reprovado, any stored restriction cleared, the text, section 9 with both restriction boxes empty', () => {
  it('the observation is required until typed; the pair writes are Reprovado and, over a stored restriction, its clear', () => {
    const block = outCable('v14');
    expect(sheetProgress({ blocks: [block] }, block.id, { floorFills: true }).steps.conclusao).toMatchObject({ missing: 1, observation: 1 });
    const typed = observations(block, 'Isolação abaixo do aceitável nas três fases.');
    expect(sheetProgress({ blocks: [typed] }, typed.id, { floorFills: true }).steps.conclusao.missing).toBe(0);
    expect(conclusionPairWrites(typed)).toEqual({ result: 'reprovado', restriction: null, clearRestriction: false });
    // A restriction tapped before the reading went out is cleared by the same batch.
    expect(conclusionPairWrites(stored(typed, null, 'sem_restricoes'))).toEqual({ result: 'reprovado', restriction: null, clearRestriction: true });
    // v13: the floor's pair, as before.
    expect(conclusionPairWrites(observations(outCable('v13'), 'x'))).toEqual({ result: 'reprovado', restriction: 'com_restricoes', clearRestriction: false });
  });

  it('concluded, section 9 prints X on REPROVADO only, and its paragraph', () => {
    const base = relatorioOf('v14');
    const cable = firstOf(base, 'cabos_entrada');
    const tag = tagOfBlock(base, cable);
    const definition = definitionOf(cable);
    const snapshot = edit(base, cable.id, (block) => {
      const typed = observations(everyCapture(checklist(block), 'isolacao', '300', 'MΩ'), 'Isolação abaixo do aceitável.');
      const text = conclusionTextOnConclude(stored(typed, 'reprovado', null), definition, tag)!;
      const done = stored(typed, 'reprovado', null);
      done.sheet.conclusion.text = cell(text.text);
      done.sheet.conclusion.text_status = cell('confirmed');
      done.sheet.conclusion.text_basis = cell(text.basis);
      return { ...done, concluded_by: CONCLUDED };
    });
    const concluded = snapshot.blocks.find((block) => block.id === cable.id)!;
    expect(printedConclusionPair(concluded)).toEqual({ result: 'reprovado', restriction: null });
    const table = conclusionTable(snapshot, cable.id);
    expect(table[1]).toEqual(BOXES(false, true, false, false));
    expect(table[2]![0]).toBe(printedConclusionText(concluded, definition, tag));
    expect(table[2]![0]).toContain('Recomenda-se a correção');
  });
});

describe('24.3-UNIT B-3 observations give no restriction on v14 (H9, as on every seed)', () => {
  for (const version of ['v14', 'v13']) {
    it(`${version}: every row C, readings within, text in OBSERVAÇÕES and in a C row: Aprovado · Sem restrições, no reason, Sem enabled`, () => {
      const block = observations(checklist(cleanCable(version), { 0: { result: 'C', observation: 'Comentário em item conforme.' } }), 'Observação que não muda a conclusão.');
      expect(conclusionFloor(block)).toEqual({ pair: { result: 'aprovado', restriction: 'sem_restricoes' }, reasons: [] });
      expect(conclusionFloorReasonText(block)).toBeNull();
      expect(isLooserThanFloor(block, 'sem_restricoes')).toBe(false);
      expect(observationRequired(block)).toBe(false);
    });
  }
});

describe('24.3-UNIT B-4 the technician\'s Aprovado · Com restrições over a clean v14 floor', () => {
  it('OBSERVAÇÕES required; nothing for the conclude to write; boxes APROVADO and COM; the parecer Apto com restrições', () => {
    const base = relatorioOf('v14');
    const cable = firstOf(base, 'cabos_entrada');
    const chosen = stored(cleanCable('v14'), 'aprovado', 'com_restricoes');
    expect(effectiveConclusionPair(chosen)).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    expect(observationRequiredBy(chosen)).toBe('com_restricoes');
    expect(sheetProgress({ blocks: [chosen] }, chosen.id).steps.conclusao).toMatchObject({ missing: 1, observation: 1 });
    expect(conclusionPairWrites(chosen)).toEqual({ result: null, restriction: null, clearRestriction: false });
    const snapshot = only(
      edit(base, cable.id, (block) => ({ ...observations(stored(everyCapture(checklist(block), 'isolacao', '1000', 'MΩ'), 'aprovado', 'com_restricoes'), 'Acompanhar.'), concluded_by: CONCLUDED })),
      [cable.id],
    );
    expect(conclusionTable(snapshot, cable.id)[1]).toEqual(BOXES(true, false, false, true));
    expect(derivedParecer(snapshot)).toBe('apto_com_restricoes');
  });
});

describe('24.3-UNIT B-5 an NC row or a restricted reading, and no failure: Aprovado · Com restrições on v14 as on v13', () => {
  for (const version of ['v14', 'v13']) {
    it(`${version}: the NC row`, () => {
      const block = checklist(cleanCable(version), { 1: { result: 'NC', observation: 'Mufla com sinais de aquecimento' } });
      expect(conclusionFloor(block)).toEqual({ pair: { result: 'aprovado', restriction: 'com_restricoes' }, reasons: ['nc'] });
      expect(conclusionFloorReasonText(block)).toBe('A ficha exige no mínimo Aprovado · Com restrições: item não conforme.');
    });

    it(`${version}: the restricted reading (below half of the largest, within its criterion)`, () => {
      const block = readings(checklist(sheet('cabos_entrada', version)), 'isolacao', { '0/1': measured('1000', 'MΩ'), '1/1': measured('1000', 'MΩ'), '2/1': measured('1000', 'MΩ'), '3/1': measured('450', 'MΩ') });
      expect(conclusionFloor(block)).toEqual({ pair: { result: 'aprovado', restriction: 'com_restricoes' }, reasons: ['restriction'] });
    });
  }
});

describe('24.3-UNIT B-6 an NC row and a reading out on v14: Reprovado with no restriction; the NC row still offers its point', () => {
  it('v14 Reprovado for the reading alone; v13 Reprovado · Com restrições for both; no point is derived, the row offers "Criar ponto de atenção"', () => {
    const v14 = checklist(outCable('v14'), { 1: { result: 'NC', observation: 'Mufla com sinais de aquecimento' } });
    expect(conclusionFloor(v14)).toEqual({ pair: { result: 'reprovado', restriction: null }, reasons: ['reading'] });
    expect(effectiveConclusionPair(v14)).toEqual({ result: 'reprovado', restriction: null });
    const v13 = checklist(outCable('v13'), { 1: { result: 'NC', observation: 'Mufla com sinais de aquecimento' } });
    expect(conclusionFloor(v13)).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['reading', 'nc'] });
    // The row's create action shows while no stored point names it (fix batch e24h: nothing is derived).
    const itemKey = definitionOf(v14).checklist![1]!.key;
    expect(ncRowPointPositions([], v14.equipment_id, [], itemKey)).toEqual([]);
  });
});

describe('24.3-UNIT B-7 the technician taps Reprovado over a clean v14 floor with a stored Com restrições', () => {
  it('the tap also clears the stored restriction; no restriction group; Aprovado again leaves the restriction missing', () => {
    const before = stored(cleanCable('v14'), 'aprovado', 'com_restricoes');
    expect(resultChoiceWrites(before, 'reprovado')).toEqual({ result: 'reprovado', clearRestriction: true });
    const reproved = stored(before, 'reprovado', null);
    expect(effectiveConclusionPair(reproved)).toEqual({ result: 'reprovado', restriction: null });
    expect(chosenConclusionPair(reproved)).toEqual({ result: 'reprovado', restriction: null });
    expect(restrictionApplies(reproved, effectiveConclusionPair(reproved).result)).toBe(false);
    expect(observationRequiredBy(reproved)).toBe('reprovado');
    expect(sheetProgress({ blocks: [observations(reproved, 'Reprovado pelo técnico.')] }, reproved.id).steps.conclusao.missing).toBe(0);
    // Aprovado again: the result alone is written, and the restriction is asked for again.
    expect(resultChoiceWrites(reproved, 'aprovado')).toEqual({ result: 'aprovado', clearRestriction: false });
    const again = stored(reproved, 'aprovado', null);
    expect(chosenConclusionPair(again)).toEqual({ result: 'aprovado', restriction: null });
    expect(sheetProgress({ blocks: [again] }, again.id).steps.conclusao.missing).toBe(1);
    // With nothing stored to clear, and on v13, the tap writes the result alone.
    expect(resultChoiceWrites(stored(cleanCable('v14'), null, null), 'reprovado')).toEqual({ result: 'reprovado', clearRestriction: false });
    expect(resultChoiceWrites(stored(cleanCable('v13'), 'aprovado', 'com_restricoes'), 'reprovado')).toEqual({ result: 'reprovado', clearRestriction: false });
    expect(resultChoiceWrites(before, null)).toEqual({ result: null, clearRestriction: false });
  });
});

describe('24.3-UNIT B-8 a v14 ficha concluded Aprovado · Com restrições, a reading then corrected out', () => {
  /** `from` concluded Aprovado · Com restrições over a clean floor with its confirmed text, then its readings corrected out. */
  function concludedFrom(from: BlockRow): { block: BlockRow; definition: BlockDefinition } {
    const clean = observations(stored(everyCapture(checklist(from), 'isolacao', '1000', 'MΩ'), 'aprovado', 'com_restricoes'), 'Acompanhar a mufla.');
    const definition = definitionOf(clean);
    const text = conclusionTextOnConclude(clean, definition, 'CE-01')!;
    const done = { ...structuredClone(clean), concluded_by: CONCLUDED };
    done.sheet.conclusion.text = cell(text.text);
    done.sheet.conclusion.text_status = cell('confirmed');
    done.sheet.conclusion.text_basis = cell(text.basis);
    return { block: everyCapture(done, 'isolacao', '300', 'MΩ'), definition };
  }
  const concluded = (version: string) => concludedFrom(sheet('cabos_entrada', version));

  it('v14: every reader shows Reprovado with no restriction, the ficha is adjusted, and Confirmar writes Reprovado and clears the restriction', () => {
    const { block, definition } = concluded('v14');
    expect(effectiveConclusionPair(block)).toEqual({ result: 'reprovado', restriction: null });
    expect(chosenConclusionPair(block)).toEqual({ result: 'reprovado', restriction: null });
    expect(printedConclusionPair(block)).toEqual({ result: 'reprovado', restriction: null });
    expect(conclusionAdjusted(block)).toBe(true);
    const now = composeConclusion(block, definition, 'CE-01');
    expect(conclusionAdjustWrites(block, definition, 'CE-01')).toEqual({ result: 'reprovado', restriction: null, clearRestriction: true, text: { text: now.text, basis: now.basis } });
    // The composed text prints meanwhile, never the stored Aprovado one.
    expect(printedConclusionText(block, definition, 'CE-01')).toBe(now.text);
    const confirmed = stored(block, 'reprovado', null);
    confirmed.sheet.conclusion.text = cell(now.text);
    confirmed.sheet.conclusion.text_basis = cell(now.basis);
    expect(conclusionAdjusted(confirmed)).toBe(false);
    expect(conclusionAdjustWrites(confirmed, definition, 'CE-01')).toBeNull();
  });

  it('v13: Reprovado · Com restrições, the restriction already stored, nothing to clear', () => {
    const { block, definition } = concluded('v13');
    expect(effectiveConclusionPair(block)).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
    expect(conclusionAdjusted(block)).toBe(true);
    expect(conclusionAdjustWrites(block, definition, 'CE-01')).toMatchObject({ result: 'reprovado', restriction: null, clearRestriction: false });
  });

  it('on the v14 relatório: the Sumário\'s counts and section 9 read Reprovado with no restriction', () => {
    const base = relatorioOf('v14');
    const cable = firstOf(base, 'cabos_entrada');
    const snapshot = only(edit(base, cable.id, (row) => concludedFrom(row).block), [cable.id]);
    const name = tagOfBlock(snapshot, cable);
    expect(parecerCounts(snapshot)).toMatchObject({ reprovado: [name], withRestriction: [] });
    expect(conclusionTable(snapshot, cable.id)[1]).toEqual(BOXES(false, true, false, false));
  });
});

describe('24.3-UNIT B-9 "Marcar Com restrições" is the kernel\'s answer', () => {
  it('never on v14; on v1 to v13 as before', () => {
    expect(markRestrictionOffered(outCable('v14'))).toBe(false);
    for (const version of ['v13', 'v12', 'v5']) expect(markRestrictionOffered({ seed_version: version }), version).toBe(true);
  });
});

describe('24.3-UNIT B-10 the arrester\'s prerequisite is read on v14 only while its nameplate is on', () => {
  const failing = (version: string) => everyCapture(checklist(plate(sheet('para_raio', version), { desligador_integro: 'NÃO' })), 'isolacao', '6000', 'MΩ');

  it('v14 nameplate on: the floor is Reprovado by the prerequisite; off: nothing fails, no floor reason, no clause', () => {
    const on = failing('v14');
    const definition = definitionOf(on);
    expect(failedPrerequisites(on, definition)).toHaveLength(1);
    expect(conclusionFloor(on)).toEqual({ pair: { result: 'reprovado', restriction: null }, reasons: ['prerequisite'] });
    const off = switchedOff(on, 'nameplate');
    expect(failedPrerequisites(off, definition)).toEqual([]);
    expect(prerequisiteFailure(off, definition, definition.tests.find((test) => test.key === 'isolacao')!)).toBeNull();
    expect(conclusionFloor(off)).toEqual({ pair: { result: 'aprovado', restriction: 'sem_restricoes' }, reasons: [] });
    expect(composeConclusion(off, definition, 'PR-1').text).not.toContain('pré-requisito');
    expect(findingClauses(off, definition)).toEqual([]);
  });

  it('v13 nameplate off: still read (row 3344 applies on v14 only)', () => {
    const off = switchedOff(failing('v13'), 'nameplate');
    expect(failedPrerequisites(off, definitionOf(off))).toHaveLength(1);
    expect(conclusionFloor(off)).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['prerequisite'] });
  });

  for (const version of ['v14', 'v13']) {
    it(`${version}: the parecer and "Origem resolvida" of a point written from the prerequisite`, () => {
      const base = relatorioOf(version);
      const arrester = firstOf(base, 'para_raio');
      const point = {
        id: id(700),
        relatorio_id: base.relatorio.id,
        text: 'Ensaio de isolação: pré-requisito não atendido (Desligador íntegro: NÃO)',
        equipment_id: arrester.equipment_id,
        origin: 'reading',
        order_key: 'a0',
        removed_at: null,
        action: null,
        priority: null,
        deadline: null,
        owner: null,
        test_key: 'isolacao',
      } as unknown as PointRow;
      const with_ = (plateOn: boolean) =>
        only(
          {
            ...edit(base, arrester.id, (block) => {
              const failed = everyCapture(checklist(plate(block, { desligador_integro: 'NÃO' })), 'isolacao', '6000', 'MΩ');
              return plateOn ? failed : switchedOff(failed, 'nameplate');
            }),
            points: [point],
          },
          [arrester.id],
        );
      expect(resolvedOriginPoints(with_(true)).has(point.id)).toBe(false);
      expect(derivedParecer(with_(true))).toBe('nao_apto');
      if (version === 'v14') {
        expect(resolvedOriginPoints(with_(false)).has(point.id)).toBe(true);
        expect(derivedParecer(with_(false))).not.toBe('nao_apto');
        expect(composeParecer(with_(false)).text).not.toContain('reprovada');
      } else {
        expect(resolvedOriginPoints(with_(false)).has(point.id)).toBe(false);
        expect(composeParecer(with_(false)).text).toContain(`1 ficha foi reprovada por pré-requisito do ensaio não atendido (${tagOfBlock(base, arrester)}).`);
      }
    });
  }
});

describe('24.3-UNIT B-11 a v14 relatório with one Reprovado ficha', () => {
  it('Não apto, the ficha under the reprovadas and never "com restrições"', () => {
    const base = relatorioOf('v14');
    const cable = firstOf(base, 'cabos_entrada');
    const snapshot = only(edit(base, cable.id, (block) => everyCapture(checklist(block), 'isolacao', '300', 'MΩ')), [cable.id]);
    expect(derivedParecer(snapshot)).toBe('nao_apto');
    expect(parecerCounts(snapshot)).toMatchObject({ reprovado: [tagOfBlock(base, cable)], withRestriction: [] });
  });
});

describe('24.3-UNIT B-12 v13, v12 and v5 fichas stored Reprovado · Com restrições and Aprovado · Com restrições by choice', () => {
  for (const version of ['v13', 'v12', 'v5']) {
    it(`${version}: every pair, reason line, count and box as before`, () => {
      const base = structuredClone(layoutLockSnapshot(version, { epic24: false }));
      const disjuntor = firstOf(base, 'disjuntor_mt');
      const tc = firstOf(base, 'tc');
      // The TC's tests switched off, so its NC row alone judges it on every seed (the v5 fixture's readings fail it).
      const snapshot = only(
        edit(edit(base, disjuntor.id, (block) => ({ ...stored(block, 'reprovado', 'com_restricoes'), concluded_by: CONCLUDED })), tc.id, (block) => ({
          ...stored(
            definitionOf(block).tests.reduce((row, test) => switchedOff(row, test.key), block),
            'aprovado',
            'com_restricoes',
          ),
          concluded_by: CONCLUDED,
        })),
        [disjuntor.id, tc.id],
      );
      const ctx = snapshotDefinitionContext(snapshot);
      const dj = snapshot.blocks.find((block) => block.id === disjuntor.id)!;
      const djDefinition = blockDefinitionIn(ctx, dj)!;
      expect(effectiveConclusionPair(dj, djDefinition, visitContextOf(snapshot, dj))).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
      // Its floor is its NC row's (the fixture's readings are within): the reason line as before, with its restriction.
      expect(conclusionFloorReasonText(dj, djDefinition, visitContextOf(snapshot, dj))).toBe('A ficha exige no mínimo Aprovado · Com restrições: item não conforme.');
      expect(conclusionTable(snapshot, disjuntor.id)[1]).toEqual(BOXES(false, true, false, true));
      expect(conclusionTable(snapshot, tc.id)[1]).toEqual(BOXES(true, false, false, true));
      expect(parecerCounts(snapshot)).toMatchObject({ reprovado: [tagOfBlock(base, disjuntor)], withRestriction: [tagOfBlock(base, tc)] });
      expect(derivedParecer(snapshot)).toBe('nao_apto');
    });
  }
});

describe('24.3-UNIT section 9 prints the four boxes of the layout-lock relatório on v14 and on v13', () => {
  /** The v13 or v14 relatório of the layout lock, its sheet of `type` (the `nth`). */
  const sheetOf = (snapshot: RelatorioSnapshot, type: string, nth = 0) => snapshot.blocks.filter((block) => block.block_type === type && block.removed_at === null)[nth]!;

  it('the breaker stored Reprovado · Com restrições by its reading out: v14 X on REPROVADO only (the stored restriction ignored on read); v13 X on REPROVADO and COM', () => {
    for (const [version, com] of [
      ['v14', false],
      ['v13', true],
    ] as const) {
      const snapshot = layoutLockSnapshot(version);
      expect(conclusionTable(snapshot, sheetOf(snapshot, 'disjuntor_mt').id)[1], version).toEqual(BOXES(false, true, false, com));
    }
  });

  it('the second arrester, its plate switched off after the conclude: v14 X on REPROVADO only (the technician\'s Reprovado); v13 as before', () => {
    expect(conclusionTable(layoutLockSnapshot('v14'), sheetOf(layoutLockSnapshot('v14'), 'para_raio', 1).id)[1]).toEqual(BOXES(false, true, false, false));
    expect(conclusionTable(layoutLockSnapshot('v13'), sheetOf(layoutLockSnapshot('v13'), 'para_raio', 1).id)[1]).toEqual(BOXES(false, true, false, true));
  });

  it('the TC stored Aprovado · Com restrições by choice prints APROVADO and COM on both', () => {
    for (const version of ['v14', 'v13']) {
      const snapshot = layoutLockSnapshot(version);
      expect(conclusionTable(snapshot, sheetOf(snapshot, 'tc').id)[1], version).toEqual(BOXES(true, false, false, true));
    }
  });

  it('isConclusionPairComplete: Reprovado alone on v14 only', () => {
    expect(isConclusionPairComplete({ seed_version: 'v14' }, { result: 'reprovado', restriction: null })).toBe(true);
    expect(isConclusionPairComplete({ seed_version: 'v13' }, { result: 'reprovado', restriction: null })).toBe(false);
    expect(isConclusionPairComplete({ seed_version: 'v14' }, { result: 'aprovado', restriction: null })).toBe(false);
    expect(isConclusionPairComplete({ seed_version: 'v14' }, { result: null, restriction: 'sem_restricoes' })).toBe(false);
  });
});

// ===================================================================================================
// Story 24.4
// ===================================================================================================

/** The breaker of a fresh relatório with its contact resistance at 310 µΩ on its first pole. */
function breakerOut(version: string): { snapshot: RelatorioSnapshot; breaker: BlockRow; tag: string } {
  const base = relatorioOf(version);
  const breaker = firstOf(base, 'disjuntor_mt');
  const snapshot = edit(base, breaker.id, (block) =>
    readings(checklist(block), 'resistencia_contato', { '0/0': measured('310', 'µΩ'), '1/0': measured('200', 'µΩ'), '2/0': measured('205', 'µΩ') }),
  );
  return { snapshot, breaker: snapshot.blocks.find((block) => block.id === breaker.id)!, tag: tagOfBlock(base, breaker) };
}

const sectionTen = (snapshot: RelatorioSnapshot): LayoutSection10 =>
  layoutSpec(snapshot, { revisionNumber: 1, issuedAt: '2026-11-11T12:00:00.000Z' }).sections.find((section): section is LayoutSection10 => section.kind === 'section_10')!;

describe('24.4-UNIT C-1 the v14 parecer names the reprovada ficha with its finding', () => {
  it('v14: "1 ficha foi reprovada: DJ, por <the clause section 9 prints>."; the box Não apto; the third bullet absent; section 8 empty of it', () => {
    const { snapshot, breaker, tag } = breakerOut('v14');
    const definition = definitionOf(breaker);
    const finding = 'resistência de contato máxima de 310 µΩ em T1-T2–Fase A (critério: <250 µΩ, aceitável na ficha)';
    expect(findingClauses(breaker, definition)).toEqual([finding]);
    expect(composeParecer(snapshot).text).toContain(`1 ficha foi reprovada: ${tag}, por ${finding}.`);
    // The same finding stands in its conclusion in section 9.
    expect(composeConclusion(breaker, definition, tag).text).toContain(finding);
    const ten = sectionTen(snapshot);
    expect(ten.parecer.title).toBe('Não apto');
    expect(ten.parecer.text).toContain(`${tag}, por ${finding}`);
    expect(ten.bullets.some((bullet) => bullet.text.startsWith('Apesar dos resultados dos testes serem positivos'))).toBe(false);
    expect(sectionEightEntries(snapshot)).toEqual([]);
  });

  it('v14: the basis carries the findings, so a summary confirmed over 310 µΩ reads stale once the reading is 400 µΩ; v13\'s basis does not move', () => {
    const corrected = (version: string) => {
      const { snapshot, breaker } = breakerOut(version);
      return { before: composeParecer(snapshot), after: composeParecer(edit(snapshot, breaker.id, (block) => readings(block, 'resistencia_contato', { '0/0': measured('400', 'µΩ') }))) };
    };
    const v14 = corrected('v14');
    expect(v14.after.text).toContain('resistência de contato máxima de 400 µΩ');
    expect(v14.after.basis).not.toBe(v14.before.basis);
    expect(parecerTextState({ verdict: 'nao_apto', text: v14.before.text, text_status: 'confirmed', text_basis: v14.before.basis }, v14.after)).toBe('stale');
    const v13 = corrected('v13');
    expect(v13.after.basis).toBe(v13.before.basis);
    expect(parecerTextState({ verdict: 'nao_apto', text: v13.before.text, text_status: 'confirmed', text_basis: v13.before.basis }, v13.after)).toBe('confirmed');
  });

  it('v13: the sentence as before, by reason category', () => {
    const { snapshot, tag } = breakerOut('v13');
    expect(composeParecer(snapshot).text).toContain(`1 ficha foi reprovada por leituras fora do critério de aceitação (${tag}).`);
    expect(composeParecer(snapshot).text).not.toContain(`${tag}, por`);
  });
});

describe('24.4-UNIT C-2 two reprovadas, one by two failed tests and one by a failed ratio row', () => {
  it('each ficha once, in tree order, its own findings: "2 fichas foram reprovadas: A, por x e y; B, por z."', () => {
    const base = relatorioOf('v14');
    const breaker = firstOf(base, 'disjuntor_mt');
    const tp = firstOf(base, 'tp');
    // With no TENSÃO NOMINAL on the plate the breaker's insulation is judged by > 400 MΩ: 300 MΩ is out.
    let snapshot = edit(base, breaker.id, (block) =>
      everyCapture(readings(checklist(block), 'resistencia_contato', { '0/0': measured('310', 'µΩ'), '1/0': measured('200', 'µΩ'), '2/0': measured('205', 'µΩ') }), 'isolacao', '300', 'MΩ'),
    );
    snapshot = edit(snapshot, tp.id, (block) =>
      readings(checklist(block), 'relacao_transformacao', { '0/0': measured('13.8', 'kV'), '0/1': measured('115', 'V'), '0/3': { raw: '125', unit: null, state: 'measured' } }),
    );
    snapshot = only(snapshot, [breaker.id, tp.id]);
    const names = parecerCounts(snapshot).reprovado;
    expect(names).toHaveLength(2);
    const findingsOf = (name: string) => {
      const block = snapshot.blocks.find((row) => row.equipment_id !== null && tagOfBlock(snapshot, row) === name && row.removed_at === null)!;
      return findingClauses(block, definitionOf(block));
    };
    const breakerFindings = findingsOf(tagOfBlock(base, breaker));
    expect(breakerFindings).toHaveLength(2);
    expect(breakerFindings[0]).toMatch(/^resistência de isolação mínima de /);
    expect(breakerFindings[1]).toMatch(/^resistência de contato máxima de 310 µΩ/);
    const tpFindings = findingsOf(tagOfBlock(base, tp));
    expect(tpFindings).toHaveLength(1);
    expect(tpFindings[0]).toMatch(/^desvio de relação de transformação de /);
    const expected = `2 fichas foram reprovadas: ${names.map((name) => `${name}, por ${listPtBr(findingsOf(name))}`).join('; ')}.`;
    expect(composeParecer(snapshot).text).toContain(expected);
    expect(expected).toContain(' e resistência de contato máxima de 310 µΩ');
  });
});

describe('24.4-UNIT C-3 a v14 ficha reprovada by a contact rise names the rise', () => {
  it('the layout-lock relatório\'s seccionadora: its finding is the rise since the previous visit, never the criterion it meets', () => {
    const snapshot = layoutLockSnapshot('v14');
    const seccionadora = snapshot.blocks.find((block) => block.block_type === 'chave_seccionadora' && block.removed_at === null)!;
    const tag = tagOfBlock(snapshot, seccionadora);
    const findings = findingClauses(seccionadora, definitionOf(seccionadora), visitContextOf(snapshot, seccionadora));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatch(/^resistência de contato máxima de .+ \(alta de .+ % sobre .+ da manutenção anterior, rev\. 1 de 05\/11\/2025, acima do limite de 50 %\)$/);
    expect(findings[0]).not.toContain('critério');
    expect(composeParecer(snapshot).text).toContain(`${tag}, por ${findings[0]}`);
  });
});

describe('24.4-UNIT C-4 a v14 ficha the technician reproved, and a defect Não ensaiado', () => {
  it('reproved with nothing out: its TAG alone; a defect: "TAG, por <reason>"', () => {
    const base = relatorioOf('v14');
    const cable = firstOf(base, 'cabos_entrada');
    const tp = firstOf(base, 'tp');
    let snapshot = edit(base, cable.id, (block) => ({ ...observations(stored(everyCapture(checklist(block), 'isolacao', '1000', 'MΩ'), 'reprovado', null), 'Ruído anormal.'), concluded_by: CONCLUDED }));
    snapshot = edit(snapshot, tp.id, (block) => ({ ...block, not_tested: { reason: 'defeito_no_equipamento', text: null, at: CONCLUDED.at, by: TEST_USER } }));
    snapshot = only(snapshot, [cable.id, tp.id]);
    const names = parecerCounts(snapshot).reprovado;
    const cableTag = tagOfBlock(base, cable);
    const tpTag = tagOfBlock(base, tp);
    expect([...names].sort()).toEqual([cableTag, tpTag].sort());
    const entries = names.map((name) => (name === cableTag ? cableTag : `${tpTag}, por defeito no equipamento`));
    expect(composeParecer(snapshot).text).toContain(`2 fichas foram reprovadas: ${entries.join('; ')}.`);
    // One ficha alone: "1 ficha foi reprovada: TAG."
    expect(composeParecer(only(snapshot, [cable.id])).text).toContain(`1 ficha foi reprovada: ${cableTag}.`);
  });
});

describe('24.4-UNIT C-5 an NC observation typed in two lines', () => {
  const twoLines = (version: string) => checklist(cleanCable(version), { 1: { result: 'NC', observation: 'linha um\nlinha dois' } });

  it('v14: the clause joins the lines with "; ", so the sentence prints in one paragraph', () => {
    const block = twoLines('v14');
    const text = composeConclusion(block, definitionOf(block), 'CE-01').text;
    expect(text).toContain('linha um; linha dois (item 2, NC)');
    expect(text).not.toContain('\n');
    // Each line without its final period, blank lines dropped.
    const dotted = checklist(cleanCable('v14'), { 1: { result: 'NC', observation: 'Mufla aquecida.\n\n  Verificar na próxima visita.  ' } });
    expect(composeConclusion(dotted, definitionOf(dotted), 'CE-01').text).toContain('Mufla aquecida; Verificar na próxima visita (item 2, NC)');
    // A line closed by ";" or "," (or with its period after one) never doubles the joining punctuation; "etc." keeps its period.
    const punctuated = checklist(cleanCable('v14'), { 1: { result: 'NC', observation: 'linha um;\nlinha dois,\nlinha três.;\nfolga, oxidação etc.' } });
    const joined = composeConclusion(punctuated, definitionOf(punctuated), 'CE-01').text;
    expect(joined).toContain('linha um; linha dois; linha três; folga, oxidação etc. (item 2, NC)');
    expect(joined).not.toMatch(/[;,]; /);
  });

  it('e24x-UNIT A4 (fix batch e24x): a line ending in ":" joins the next with a space, never ":;"', () => {
    const colon = checklist(cleanCable('v14'), { 1: { result: 'NC', observation: 'Observado:\n- trinca' } });
    const text = composeConclusion(colon, definitionOf(colon), 'CE-01').text;
    expect(text).toContain('Observado: - trinca (item 2, NC)');
    expect(text).not.toContain(':;');
    // The colon line among others: only the line after it joins with a space.
    const among = checklist(cleanCable('v14'), { 1: { result: 'NC', observation: 'Mufla aquecida.\nObservado:\n- trinca\n- folga' } });
    expect(composeConclusion(among, definitionOf(among), 'CE-01').text).toContain('Mufla aquecida; Observado: - trinca; - folga (item 2, NC)');
  });

  it('v13: the observation as typed, its line break kept (text and basis as before)', () => {
    const block = twoLines('v13');
    expect(composeConclusion(block, definitionOf(block), 'CE-01').text).toContain('linha um\nlinha dois (item 2, NC)');
    // The basis hashes the inputs, never the joined clause: the same on both seeds.
    const v14 = twoLines('v14');
    expect(composeConclusion(v14, definitionOf(v14), 'CE-01').basis).toBe(composeConclusion(block, definitionOf(block), 'CE-01').basis);
  });

  it('section 9 prints the v14 sentence in one paragraph', () => {
    const base = relatorioOf('v14');
    const cable = firstOf(base, 'cabos_entrada');
    const tag = tagOfBlock(base, cable);
    const snapshot = edit(base, cable.id, (block) => {
      const answered = observations(stored(everyCapture(checklist(block, { 1: { result: 'NC', observation: 'linha um\nlinha dois' } }), 'isolacao', '1000', 'MΩ'), 'aprovado', 'com_restricoes'), 'Ver item 2.');
      const text = conclusionTextOnConclude(answered, definitionOf(answered), tag)!;
      answered.sheet.conclusion.text = cell(text.text);
      answered.sheet.conclusion.text_status = cell('confirmed');
      answered.sheet.conclusion.text_basis = cell(text.basis);
      return { ...answered, concluded_by: CONCLUDED };
    });
    const row = conclusionTable(snapshot, cable.id)[2]!;
    expect(row).toHaveLength(1);
    expect(row[0]).toContain('linha um; linha dois (item 2, NC)');
  });
});

describe('24.4-UNIT C-6 the fixed reference replaced across formatted runs', () => {
  it('referenceAcrossRuns: the phrase split by a bold "8 e 9" reads the positions, in the marks of the run where it starts', () => {
    expect(referenceAcrossRuns([{ text: 'encontram-se nos itens ' }, { text: '8 e 9', bold: true }, { text: ' deste relatório;' }], 'nos itens 4 e 5')).toEqual([
      { text: 'encontram-se nos itens 4 e 5' },
      { text: ' deste relatório;' },
    ]);
    expect(referenceAcrossRuns([{ text: 'nos ' }, { text: 'itens 8', italic: true }, { text: ' e 9 e nos itens 8 e 9.' }], 'no item 5')).toEqual([{ text: 'no item 5' }, { text: ' e no item 5.' }]);
    expect(referenceAcrossRuns([{ text: 'a ' }, { text: 'nos itens 8 e 9', bold: true }, { text: '.' }], 'nos itens 4 e 5')).toEqual([{ text: 'a ' }, { text: 'nos itens 4 e 5', bold: true }, { text: '.' }]);
    // Nothing to replace: the runs as they were.
    expect(referenceAcrossRuns([{ text: 'nos itens ' }, { text: '7', bold: true }], 'nos itens 4 e 5')).toEqual([{ text: 'nos itens ' }, { text: '7', bold: true }]);
  });

  /** A relatório whose sections 8 and 9 print at positions 4 and 5 (sections 3 to 6 removed), and a template text with the bold "8 e 9". */
  function positioned(version: string): LayoutSection10 {
    const base = relatorioOf(version);
    const snapshot = {
      ...base,
      blocks: base.blocks.map((block) => (['section_3', 'section_4', 'section_5', 'section_6'].includes(block.block_type) ? { ...block, removed_at: '2026-11-11T10:00:00.000Z' } : block)),
    };
    const runs = [{ text: 'Os resultados encontram-se nos itens ' }, { text: '8 e 9', bold: true as const }, { text: ' deste relatório;' }];
    return section10Layout(snapshot, { number: 7, title: 'CONCLUSÃO', paragraphs: [{ kind: 'item', text: runs.map((run) => run.text).join(''), runs }] });
  }

  it('v14: the bullet\'s text and runs read "nos itens 4 e 5", no "8 e 9"', () => {
    const [bullet] = positioned('v14').bullets;
    expect(bullet!.text).toBe('Os resultados encontram-se nos itens 4 e 5 deste relatório;');
    expect(bullet!.runs).toEqual([{ text: 'Os resultados encontram-se nos itens 4 e 5' }, { text: ' deste relatório;' }]);
    expect(bullet!.runs.map((run) => run.text).join('')).not.toContain('8 e 9');
  });

  it('v13: the runs as before (each run replaced alone, so the split phrase keeps its numbers)', () => {
    const [bullet] = positioned('v13').bullets;
    expect(bullet!.text).toBe('Os resultados encontram-se nos itens 4 e 5 deste relatório;');
    expect(bullet!.runs).toEqual([{ text: 'Os resultados encontram-se nos itens ' }, { text: '8 e 9', bold: true }, { text: ' deste relatório;' }]);
  });
});

describe('24.4-UNIT C-7 a v13 relatório with the same fichas, observation and template text', () => {
  it('the layout-lock v13 parecer, its basis and the two-line conclusion are those main composed', () => {
    const snapshot = layoutLockSnapshot('v13');
    const parecer = composeParecer(snapshot);
    // Pinned on the code before this batch (main 8bddd986 plus Story 24.2), the kernel unchanged for v13.
    expect(parecer.basis).toBe('d32f4f01');
    expect(parecer.text).toContain('6 fichas foram reprovadas: 1 por relação de transformação insatisfatória (TR-1), 4 por leituras fora do critério de aceitação');
    const cable = snapshot.blocks.find((block) => block.block_type === 'cabos_entrada' && block.removed_at === null)!;
    const composed = composeConclusion(cable, definitionOf(cable), tagOfBlock(snapshot, cable), visitContextOf(snapshot, cable));
    expect(composed.basis).toBe('698c1a0f');
    expect(composed.text).toContain('sinais de aquecimento na mufla\nVerificar na próxima visita (item 2, NC)');
  });
});
