import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { conclusionFloorReasonText, conclusionRestrictionOf, conclusionResultOf, isLooserThanFloor, storedConclusionPairText } from '../relatorio/conclusion.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { sheetMeasurements, sheetReadings } from '../relatorio/sheet-evaluation.ts';
import { isEquipmentBlock } from '../relatorio/sheet-state.ts';
import { visitContextOf } from '../relatorio/visit-context.ts';
import type { BlockRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, snapshotDefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { auditBlockLabel } from './input.ts';
import type { AuditFindingRow } from './text.ts';

/*
 * Story 25.24 (M16, the last part of M20; Matheus's decision 10): three checks of the Conferência por
 * IA that no longer depend on the model. Each is computed here from the relatório's snapshot, with no
 * run and no call, so it is always current, and listed beside the model's findings marked "Regra":
 *   1. `stored_result_looser`: a ficha whose stored result is looser than the result its readings give
 *      (the floor, `conclusionFloor`): it was not concluded again after a reading changed. The document
 *      already prints the stricter pair (`effectiveConclusionPair`); the rule tells the technician.
 *   2. `repeated_values`: the same run of three or more measured values, in the same order, on the same
 *      test of two different equipment of the same type (a copied sheet). A run of one repeated value
 *      ("0; 0; 0", an instrument's limit) is not one: it says nothing of a copy.
 *   3. `voltage_above_winding`: a row tested at a voltage above what its winding supports, in the
 *      sheet's own notice (`rowVoltageNotice`, Story 22.8), word for word.
 * They stay information, like the model's findings: nothing reads them but the Export dialog. No rule
 * is a row before generating, a status, a count or a line of the document.
 */

/** The three fixed rules, in the order a sheet lists them. */
export const AUDIT_RULE_KINDS = ['stored_result_looser', 'voltage_above_winding', 'repeated_values'] as const;
export type AuditRuleKind = (typeof AUDIT_RULE_KINDS)[number];

// authored (Story 25.24, listed for Bruno): each rule's kind as its row names it; the first is the frame's word (`73-exportar.html`).
export const AUDIT_RULE_KIND_LABELS: Readonly<Record<AuditRuleKind, string>> = {
  stored_result_looser: 'Resultado da ficha',
  voltage_above_winding: 'Tensão de ensaio',
  repeated_values: 'Valores repetidos',
};

/** The fewest values in a row that make a repeated run. */
export const REPEATED_RUN_MIN = 3;

interface Sheet {
  block: BlockRow;
  definition: BlockDefinition;
  label: string;
  /** Position in tree order. */
  order: number;
}

interface Measured {
  key: string;
  text: string;
}

interface MeasuredTest {
  /** The test's identity across sheets of one type: its grammar and key. */
  key: string;
  title: string;
  values: Measured[];
}

/** "45 µΩ": a measured value as the rule's sentence names it. */
function valueText(raw: string, unit: string | null): string {
  const number = formatDecimalGroupedPtBr(raw);
  return unit === null || unit === '' ? number : `${number} ${unit}`;
}

function measured(raw: string, unit: string | null): Measured {
  return { key: `${Number(raw)}\u0000${unit ?? ''}`, text: valueText(raw, unit) };
}

/** The measured values of each live test of a sheet, in sheet order: the seeded tests' captures, then the measurement tests' numbers. */
function measuredTests(sheet: Sheet, visit: ReturnType<typeof visitContextOf>): MeasuredTest[] {
  const tests: MeasuredTest[] = [];
  for (const test of sheetReadings(sheet.block, sheet.definition, visit)) {
    const values = test.tables.flatMap((table) => table.rows.flatMap((row) => row.cells.filter((cell) => cell.role === 'capture' && cell.state === 'measured').map((cell) => measured(cell.raw, cell.unit))));
    tests.push({ key: `test:${test.testKey}`, title: test.title, values });
  }
  for (const test of sheetMeasurements(sheet.block, sheet.definition, visit)) {
    if (!test.enabled || test.skipped || test.applicability.state === 'na') continue;
    const values = test.rows.flatMap((row) => row.cells.filter((cell) => cell.fixed === null && cell.kind === 'number' && cell.state === 'measured').map((cell) => measured(cell.raw, cell.unit)));
    tests.push({ key: `measurement:${test.testKey}`, title: test.label, values });
  }
  return tests;
}

/** The longest run of `REPEATED_RUN_MIN` or more values two lists share in the same order, not all one value; null when none. */
export function sharedRun<T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean = (x, y) => x === y): T[] | null {
  let best: T[] | null = null;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (!same(a[i - 1]!, b[j - 1]!)) continue;
      const length = previous[j - 1]! + 1;
      current[j] = length;
      if (length < REPEATED_RUN_MIN || (best !== null && length <= best.length)) continue;
      const run = a.slice(i - length, i);
      if (run.some((value) => !same(value, run[0]!))) best = run;
    }
    previous = current;
  }
  return best;
}

/** Two sheets of different equipment: two blocks of one equipment are the same unit, never a copy. */
function differentEquipment(a: BlockRow, b: BlockRow): boolean {
  if (a.id === b.id) return false;
  return a.equipment_id === null || b.equipment_id === null || a.equipment_id !== b.equipment_id;
}

/**
 * The fixed rules of a relatório, as rows of the audit's list: per sheet in tree order its first and
 * third rules, then the repeated runs by the first sheet of each pair. Each row targets its sheet
 * (the repeated run, the second sheet of the pair), and its key is stable while what it names is.
 */
export function auditRuleRows(snapshot: RelatorioSnapshot): AuditFindingRow[] {
  const ctx = snapshotDefinitionContext(snapshot);
  const blocks = new Map(snapshot.blocks.map((row) => [row.id, row]));
  const sheets: Sheet[] = [];
  for (const node of sheetOrder(snapshot)) {
    const block = blocks.get(node.blockId);
    if (block === undefined || block.removed_at !== null || !isEquipmentBlock(block) || block.not_tested !== null) continue;
    const definition = blockDefinitionIn(ctx, block);
    if (definition === null) continue;
    sheets.push({ block, definition, label: auditBlockLabel(snapshot, block), order: sheets.length });
  }

  const rows: AuditFindingRow[] = [];
  const row = (kind: AuditRuleKind, key: string, sheet: Sheet, text: string): AuditFindingRow => ({
    key: `rule:${kind}:${key}`,
    kindLabel: AUDIT_RULE_KIND_LABELS[kind],
    targetLabel: sheet.label,
    text,
    target: { kind: 'sheet', blockId: sheet.block.id },
    rule: true,
  });
  const byTest = new Map<string, { sheet: Sheet; test: MeasuredTest }[]>();

  for (const sheet of sheets) {
    const visit = visitContextOf(snapshot, sheet.block);
    // 1. The stored result looser than the floor.
    const stored = storedConclusionPairText(sheet.block);
    const result = conclusionResultOf(sheet.block);
    const restriction = conclusionRestrictionOf(sheet.block);
    const looser = result !== null && (isLooserThanFloor(sheet.block, result, sheet.definition, visit) || (restriction !== null && isLooserThanFloor(sheet.block, restriction, sheet.definition, visit)));
    const floorText = looser ? conclusionFloorReasonText(sheet.block, sheet.definition, visit) : null;
    // authored (Story 25.24, listed for Bruno): the first rule's sentence, then the ficha's own reason line.
    if (stored !== null && floorText !== null) rows.push(row('stored_result_looser', sheet.block.id, sheet, `Ficha concluída ${stored}. ${floorText}`));

    // 3. A row tested above what its winding supports: the sheet's notice.
    for (const test of sheetReadings(sheet.block, sheet.definition, visit)) {
      for (const table of test.tables) {
        for (const evaluated of table.rows) {
          const notice = evaluated.voltage?.notice ?? null;
          if (notice !== null) rows.push(row('voltage_above_winding', `${sheet.block.id}:${test.testKey}:${evaluated.row}`, sheet, notice));
        }
      }
    }

    // 2. Gathered per type and test; compared below.
    for (const test of measuredTests(sheet, visit)) {
      if (test.values.length < REPEATED_RUN_MIN) continue;
      const group = `${sheet.block.block_type}\u0000${test.key}`;
      const list = byTest.get(group) ?? [];
      list.push({ sheet, test });
      byTest.set(group, list);
    }
  }

  const repeated: { order: number; row: AuditFindingRow }[] = [];
  for (const list of byTest.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const first = list[i]!;
        const second = list[j]!;
        if (!differentEquipment(first.sheet.block, second.sheet.block)) continue;
        const run = sharedRun(first.test.values, second.test.values, (x, y) => x.key === y.key);
        if (run === null) continue;
        // authored (Story 25.24, listed for Bruno): the second rule's sentence, naming both sheets and the run.
        const text = `${first.test.title}: os mesmos valores, na mesma ordem, em ${first.sheet.label} e ${second.sheet.label} (${run.map((value) => value.text).join('; ')}).`;
        repeated.push({ order: first.sheet.order, row: row('repeated_values', `${first.sheet.block.id}:${second.sheet.block.id}:${first.test.key}`, second.sheet, text) });
      }
    }
  }
  repeated.sort((a, b) => a.order - b.order);
  return [...rows, ...repeated.map((entry) => entry.row)];
}
