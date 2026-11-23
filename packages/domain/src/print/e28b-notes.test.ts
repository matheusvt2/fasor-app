import { describe, expect, it } from 'vitest';
import { layoutLockEpic25Snapshot } from '../../fixtures/layout-lock/op-log.ts';
import { cellAddressesOf } from '../relatorio/reading-evaluation.ts';
import type { BlockRow, Cell, LastResults } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import { manyVariationsText, relevantNoteText, VARIATION_THRESHOLDS } from './history-note.ts';
import { overRangeNoteLines, overRangeNoteText } from './over-range-note.ts';
import { blockReadings } from './last-results.ts';
import { readingSlotsOf } from './reading-slots.ts';
import { visitContextOf } from '../relatorio/visit-context.ts';
import { section9Layout, type PrintSheet } from './section-9.ts';

/*
 * 28.7-UNIT and 28.8-UNIT (batch e28b, Stories 28.7 and 28.8; B-6, B-7, Matheus's Q-7): Bruno's line under an insulation
 * test with a reading above the instrument's limit, and the variation note by his numbers, on seed v18; v17 prints as
 * before. The relatório is the Epic 25 layout-lock fixture (invented values), its breaker's readings and previous visit set
 * per case; the breaker's contact criterion is the seed's.
 */

const TITLE = 'RELATÓRIOS DOS ENSAIOS';
const NBSP = ' ';
const NOTE = 'Em relação à manutenção anterior: ';
const BRUNO = 'Valores de resistência de isolação superiores a ';

const sheetsOf = (snapshot: RelatorioSnapshot): PrintSheet[] => (section9Layout(snapshot, 9, TITLE)?.subsections ?? []).flatMap((s) => s.sheets);
const paragraphsOf = (sheet: PrintSheet): string[] => sheet.parts.flatMap((part) => (part.kind === 'paragraph' ? [part.text] : []));

let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: `019a6400-2808-7000-8000-${(++opCounter).toString(16).padStart(12, '0')}` });
const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });
const overRange = (raw: string, unit: string) => ({ raw, unit, state: 'over_range' as const });

/** The fixture's breaker (DJ-REGRAS), the sheet whose previous visit Story 25.8 pins. */
function breakerOf(snapshot: RelatorioSnapshot): BlockRow {
  return snapshot.blocks.find((block) => block.block_type === 'disjuntor_mt' && block.removed_at === null && snapshot.equipment.find((row) => row.id === block.equipment_id)?.last_results != null)!;
}

/** The breaker's `testKey` capture cells now (in address order) and, when `before` is given, its previous visit's. */
function withBreaker(version: 'v17' | 'v18', testKey: 'resistencia_contato' | 'isolacao', now: readonly (unknown | null)[], before?: readonly (string | null)[]): { snapshot: RelatorioSnapshot; sheet: () => PrintSheet } {
  const base = layoutLockEpic25Snapshot(version);
  const breaker = breakerOf(base);
  const definition = getDefinition(version, 'cabine_primaria', 'disjuntor_mt');
  const addresses = cellAddressesOf(definition, testKey);
  const block = structuredClone(breaker);
  const test = block.sheet.test[testKey]!;
  now.forEach((value, i) => {
    const address = addresses[i]!;
    if (value === null) return;
    test.cells[String(address.row)] = { ...test.cells[String(address.row)], [String(address.col)]: cell(value) };
  });
  const slots = readingSlotsOf(definition, block);
  const equipment = base.equipment.map((row) => {
    if (row.id !== breaker.equipment_id || before === undefined) return row;
    const entry = structuredClone(row.last_results!) as LastResults;
    before.forEach((raw, i) => {
      const address = addresses[i]!;
      const key = slots.find((slot) => slot.testKey === testKey && slot.row === address.row && slot.col === address.col)!.key;
      if (raw === null) delete entry.readings[key];
      else entry.readings[key] = { raw, unit: 'µΩ', state: 'measured' };
    });
    return { ...row, last_results: entry };
  });
  const snapshot = { ...base, equipment, blocks: base.blocks.map((row) => (row.id === breaker.id ? block : row)) };
  return { snapshot, sheet: () => sheetsOf(snapshot).find((sheet) => sheet.blockId === breaker.id)! };
}

describe('28.7-UNIT a reading above the instrument\'s limit prints with Bruno\'s line (v18)', () => {
  it('one limit: the cell keeps "> 2 TΩ" and one line names "2 TΩ", the value kept with its unit', () => {
    const { sheet } = withBreaker('v18', 'isolacao', [overRange('2', 'TΩ')]);
    const lines = paragraphsOf(sheet()).filter((text) => text.startsWith(BRUNO));
    expect(lines).toEqual([`${BRUNO}2${NBSP}TΩ, limite de leitura do instrumento na tensão de ensaio aplicada.`]);
    const cells = sheet().parts.flatMap((part) => (part.kind === 'table' ? part.table.rows.flatMap((row) => row.cells.map((one) => one.text.replace(/ /gu, ' '))) : []));
    expect(cells).toContain('> 2 TΩ');
    // Story 23.4's sentence gives way to Bruno's on v18.
    expect(paragraphsOf(sheet()).some((text) => text.startsWith('Valores de resistência de isolamento'))).toBe(false);
  });

  it('two limits give one line each in the order they first appear; the same limit twice gives one', () => {
    const { sheet } = withBreaker('v18', 'isolacao', [overRange('5', 'TΩ'), overRange('2', 'TΩ'), overRange('5', 'TΩ')]);
    expect(paragraphsOf(sheet()).filter((text) => text.startsWith(BRUNO))).toEqual([overRangeNoteText('5', 'TΩ'), overRangeNoteText('2', 'TΩ')]);
  });

  it('no reading above the limit: no line', () => {
    const { sheet } = withBreaker('v18', 'isolacao', [measured('12', 'GΩ')]);
    expect(paragraphsOf(sheet()).filter((text) => text.startsWith(BRUNO))).toEqual([]);
  });

  it('only the insulation test: a contact reading above the limit keeps "> valor" with no note', () => {
    const evaluation = { testKey: 'resistencia_contato' as const, tables: [{ rows: [{ cells: [{ role: 'capture', state: 'over_range', raw: '2', unit: 'mΩ' }] }] }] };
    expect(overRangeNoteLines('v18', evaluation as never)).toEqual([]);
  });

  it('v17: no line of Bruno\'s; Story 23.4\'s note stands as before', () => {
    const { sheet } = withBreaker('v17', 'isolacao', [overRange('2', 'TΩ')]);
    const paragraphs = paragraphsOf(sheet());
    expect(paragraphs.filter((text) => text.startsWith(BRUNO))).toEqual([]);
    expect(paragraphs).toContain('Valores de resistência de isolamento superiores a 2 TΩ, limite de leitura do instrumento.');
  });
});

describe('28.8-UNIT the variation note by Bruno\'s numbers (v18)', () => {
  const contactNote = (version: 'v17' | 'v18', now: readonly string[], before: readonly string[]) =>
    paragraphsOf(withBreaker(version, 'resistencia_contato', now.map((raw) => measured(raw, 'µΩ')), before).sheet()).filter((text) => text.startsWith(NOTE));

  it('the numbers', () => {
    expect(VARIATION_THRESHOLDS).toEqual({ insulationDropPct: 50, contactRisePct: 25, ratioErrorPp: 0.5, windingVariationPct: 2 });
  });

  it('a pole that rose 30 % is named with its rise and its previous value; one at exactly 25 % and one at 20 % are not', () => {
    expect(contactNote('v18', ['52', '50', '48'], ['40', '40', '40'])).toEqual([`${NOTE}T1-T2 subiu 30${NBSP}% (antes 40${NBSP}µΩ).`]);
    // Two past the number on the equipment: each named in the test's own note.
    expect(contactNote('v18', ['52', '52', '48'], ['40', '40', '40'])).toEqual([`${NOTE}T1-T2 subiu 30${NBSP}% (antes 40${NBSP}µΩ); T3-T4 subiu 30${NBSP}% (antes 40${NBSP}µΩ).`]);
  });

  it('a change of level is named, judged by today\'s criterion, whatever the share', () => {
    // The criterion is < 250 µΩ: T5-T6 rose 11 % (under 25 %) and went out; the other two rose 4 % and stayed within.
    expect(contactNote('v18', ['240', '240', '262'], ['230', '230', '236'])).toEqual([`${NOTE}T5-T6 passou a fora do critério (antes 236${NBSP}µΩ, dentro do critério).`]);
  });

  it('back within its criterion is named too', () => {
    expect(contactNote('v18', ['230', '230', '236'], ['240', '240', '262'])).toEqual([`${NOTE}T5-T6 passou a dentro do critério (antes 262${NBSP}µΩ, fora do critério).`]);
  });

  it('three relevant variations on one equipment become one line naming the test and the count', () => {
    expect(contactNote('v18', ['60', '60', '60'], ['40', '40', '40'])).toEqual([`${NOTE}3 variações relevantes (Ensaio de resistência ôhmica de contato: 3).`]);
  });

  it('a reading above the limit on either visit is never named', () => {
    const now = withBreaker('v18', 'resistencia_contato', [overRange('2', 'mΩ'), measured('40', 'µΩ'), measured('40', 'µΩ')], ['40', '40', '40']).sheet();
    expect(paragraphsOf(now).filter((text) => text.startsWith(NOTE))).toEqual([]);
  });

  it('v17: the note of Story 24.16 as before (the 30 % rise is within its rule, nothing named)', () => {
    expect(contactNote('v17', ['52', '50', '48'], ['40', '40', '40'])).toEqual([]);
  });

  it('the forms', () => {
    expect(relevantNoteText([])).toBeNull();
    expect(relevantNoteText([{ where: 'T1-T2', text: 'subiu 30 % (antes 40 µΩ)' }, { where: 'T5-T6', text: 'passou a fora do critério (antes 236 µΩ, dentro do critério)' }])).toBe(
      'Em relação à manutenção anterior: T1-T2 subiu 30 % (antes 40 µΩ); T5-T6 passou a fora do critério (antes 236 µΩ, dentro do critério).',
    );
    expect(manyVariationsText([{ testKey: 'isolacao', testTitle: 'Ensaio de isolação' }, { testKey: 'c', testTitle: 'Resistência ôhmica de contato' }, { testKey: 'c', testTitle: 'Resistência ôhmica de contato' }])).toBe(
      'Em relação à manutenção anterior: 3 variações relevantes (Ensaio de isolação: 1; Resistência ôhmica de contato: 2).',
    );
  });
});

describe('28.8-UNIT the fixture\'s second visit on v18 and v17', () => {
  const notesBy = (snapshot: RelatorioSnapshot) =>
    Object.fromEntries(sheetsOf(snapshot).flatMap((sheet) => {
      const notes = paragraphsOf(sheet).filter((text) => text.startsWith(NOTE));
      return notes.length === 0 ? [] : [[sheet.title, notes]];
    }));

  it('v18: the oil transformer (insulation fell to a third, winding up 25 %) is one line; the company sheet names its two voltages back within', () => {
    const notes = notesBy(layoutLockEpic25Snapshot('v18'));
    expect(notes['TRANSFORMADOR DE FORÇA TR-1']).toEqual([`${NOTE}15 variações relevantes (Ensaio de isolação: 3; Resistência ôhmica dos enrolamentos: 12).`]);
    expect(notes['RETIFICADOR NOMINAL SINTÉTICO RN-REGRAS']).toEqual([`${NOTE}Tensão de saída passou a dentro do critério (antes 114,3${NBSP}Vcc, fora do critério); Tensão de flutuação passou a dentro do critério (antes 112,5${NBSP}Vcc, fora do critério).`]);
  });

  it('v17: Story 24.16\'s note, each cell its rule flagged with the kernel\'s full sentence', () => {
    const notes = notesBy(layoutLockEpic25Snapshot('v17'));
    expect(notes['TRANSFORMADOR DE FORÇA TR-1']?.[0]).toMatch(/^Em relação à manutenção anterior: Primário\/Massa, queda de mais de 50 % desde a manutenção anterior/u);
    expect(notes['RETIFICADOR NOMINAL SINTÉTICO RN-REGRAS']).toBeUndefined();
  });

  it('the ratio: an error that moved more than 0,5 percentage point is named; one that moved 0,5 or less is not', () => {
    const base = layoutLockEpic25Snapshot('v18');
    const tp = base.blocks.find((block) => block.block_type === 'tp' && block.removed_at === null && block.not_tested === null)!;
    const definition = getDefinition('v18', 'cabine_primaria', 'tp');
    const readings = blockReadings(tp, definition, visitContextOf(base, tp));
    const ratioKeys = Object.keys(readings).filter((key) => key.startsWith('relacao_transformacao|'));
    expect(ratioKeys.length).toBeGreaterThan(0);
    const withPrevious = (factor: number): RelatorioSnapshot => {
      const shifted = Object.fromEntries(Object.entries(readings).map(([key, value]) => [key, key.startsWith('relacao_transformacao|') ? { ...value, raw: String(Number(value.raw) * factor) } : value]));
      const entry: LastResults = { relatorio_id: '019a6400-2808-7000-8000-0000000000ff', revision_number: 1, issued_at: '2025-11-06T12:00:00.000Z', seed_version: 'v18', block_type: 'tp', readings: shifted, prior: null };
      return { ...base, equipment: base.equipment.map((row) => (row.id === tp.equipment_id ? { ...row, last_results: entry } : row)) };
    };
    const tpNotes = (snapshot: RelatorioSnapshot) => paragraphsOf(sheetsOf(snapshot).find((sheet) => sheet.blockId === tp.id)!).filter((text) => text.startsWith(NOTE));
    // 0,4 % lower then: the error moved 0,4 point; 0,7 % lower: 0,7 point.
    expect(tpNotes(withPrevious(0.996))).toEqual([]);
    const moved = tpNotes(withPrevious(0.993));
    // Fase T is not measured on this fixture's TP (Story 25.9).
    expect(moved).toEqual([`${NOTE}Fase R teve o erro alterado em 0,7${NBSP}ponto percentual (antes desvio de 1,6${NBSP}%); Fase S teve o erro alterado em 0,7${NBSP}ponto percentual (antes desvio de 1,6${NBSP}%).`]);
  });
});
