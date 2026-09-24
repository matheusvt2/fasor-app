import type { SubBlockKey } from '../schemas/block-config.ts';
import type { BlockRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { plural } from '../text/plural.ts';
import { formatShortDateTime } from '../format/datetime.ts';
import { enabledSubBlocksOf, isCellFilled } from './sheet-state.ts';

/*
 * Story 5.1: the per-sheet progress the Sheet header's Progress counter, the Section
 * stepper and "Concluir ficha" read (EXPERIENCE.md › Progress counter, Section stepper).
 * Named `sheetProgress`, not `progress`: Story 4.3's relatório-wide `progress(snapshot)`
 * already owns that name (spec 5.1-5.4, Naming resolution).
 *
 * What counts as missing, step by step:
 * - `placa`: every nameplate field of the block's definition whose cell is not filled.
 * - `verificacoes`: every checklist item neither answered (a filled result cell) nor NA by
 *   the block's `na_defaults` with no cell of its own; plus every NC row whose observation
 *   is empty (the observation is required on NC).
 * - `ensaios`: per enabled test, the capture/input cells its tables hold, less the filled
 *   cells stored under the test (counted, not addressed: the row/col scheme is Stories
 *   5.5-5.7's).
 * - `conclusao`: 1 while the conclusion result is unfilled.
 * A disabled sub-block counts nothing (AR-17). A pending suggestion is a row, never a
 * cell, so an unconfirmed suggestion is empty here by construction.
 */

export type SheetStep = 'placa' | 'verificacoes' | 'ensaios' | 'conclusao';

/** The four steps in their stepper order. */
export const SHEET_STEPS: readonly SheetStep[] = ['placa', 'verificacoes', 'ensaios', 'conclusao'];

export interface SheetProgress {
  steps: Record<SheetStep, { missing: number }>;
  /** Every step's `missing` is zero. */
  complete: boolean;
  /** The first step (stepper order) with something missing, or null when complete. */
  firstIncompleteStep: SheetStep | null;
}

/** The value of a checklist result cell that names a non-conformity. */
const NC = 'NC';

/** The test sub-blocks a definition's `tests` may carry. */
const TEST_KEYS: readonly SubBlockKey[] = ['isolacao', 'resistencia_contato', 'relacao_transformacao'];

function definitionOf(block: BlockRow): BlockDefinition | null {
  try {
    return getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  } catch {
    return null;
  }
}

/** The item keys the block's config pre-marks NA (display default, never a cell). */
export function naDefaultsOf(block: Pick<BlockRow, 'config'>): ReadonlySet<string> {
  const config = block.config;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return new Set();
  const keys = (config as { na_defaults?: unknown }).na_defaults;
  return new Set(Array.isArray(keys) ? keys.filter((key): key is string => typeof key === 'string') : []);
}

/**
 * The result a checklist row shows: its stored value when one is filled, "NA" for an
 * `na_defaults` item with no cell of its own, else null (unset).
 */
export function checklistResultOf(block: Pick<BlockRow, 'config' | 'sheet'>, itemKey: string): 'C' | 'NC' | 'NA' | null {
  const cell = block.sheet.checklist[itemKey]?.result;
  if (cell !== undefined) {
    if (!isCellFilled(cell)) return null;
    const value = cell.value;
    return value === 'C' || value === 'NC' || value === 'NA' ? value : null;
  }
  return naDefaultsOf(block).has(itemKey) ? 'NA' : null;
}

function placaMissing(block: BlockRow, definition: BlockDefinition, enabled: ReadonlySet<SubBlockKey>): number {
  if (!enabled.has('nameplate')) return 0;
  return definition.nameplate.filter((field) => !isCellFilled(block.sheet.nameplate[field.key])).length;
}

function verificacoesMissing(block: BlockRow, definition: BlockDefinition, enabled: ReadonlySet<SubBlockKey>): number {
  if (!enabled.has('checklist') || definition.checklist === null) return 0;
  let missing = 0;
  for (const item of definition.checklist) {
    const result = checklistResultOf(block, item.key);
    if (result === null) missing += 1;
    else if (result === NC && !isCellFilled(block.sheet.checklist[item.key]?.observation)) missing += 1;
  }
  return missing;
}

function ensaiosMissing(block: BlockRow, definition: BlockDefinition, enabled: ReadonlySet<SubBlockKey>): number {
  let missing = 0;
  for (const test of definition.tests) {
    if (!TEST_KEYS.includes(test.key) || !enabled.has(test.key)) continue;
    let required = 0;
    for (const table of test.tables) {
      const typed = table.value_columns.filter((column) => column.role === 'capture' || column.role === 'input').length;
      required += table.rows.length * typed;
    }
    let filled = 0;
    for (const row of Object.values(block.sheet.test[test.key]?.cells ?? {})) {
      for (const cell of Object.values(row)) if (isCellFilled(cell)) filled += 1;
    }
    missing += Math.max(required - filled, 0);
  }
  return missing;
}

function conclusaoMissing(block: BlockRow, enabled: ReadonlySet<SubBlockKey>): number {
  if (!enabled.has('conclusion')) return 0;
  return isCellFilled(block.sheet.conclusion.result) ? 0 : 1;
}

/** One sheet's progress; every step empty-handed (0) for a block that is not an equipment sheet. */
export function sheetProgress(snapshot: Pick<RelatorioSnapshot, 'blocks'>, blockId: string): SheetProgress {
  const block = snapshot.blocks.find((row) => row.id === blockId);
  const definition = block === undefined ? null : definitionOf(block);
  const steps: Record<SheetStep, { missing: number }> = {
    placa: { missing: 0 },
    verificacoes: { missing: 0 },
    ensaios: { missing: 0 },
    conclusao: { missing: 0 },
  };
  // Story 5.9 / AR-17: a sheet marked not tested prints from its plate and its reason
  // alone (section 8); its nameplate/checklist/tests/conclusion go read-only and never
  // block "Concluir ficha" or the stepper on their own account.
  if (block !== undefined && block.not_tested !== null) {
    return { steps, complete: true, firstIncompleteStep: null };
  }
  if (block !== undefined && definition !== null) {
    const enabled = enabledSubBlocksOf(block);
    steps.placa.missing = placaMissing(block, definition, enabled);
    steps.verificacoes.missing = verificacoesMissing(block, definition, enabled);
    steps.ensaios.missing = ensaiosMissing(block, definition, enabled);
    steps.conclusao.missing = conclusaoMissing(block, enabled);
  }
  const firstIncompleteStep = SHEET_STEPS.find((step) => steps[step].missing > 0) ?? null;
  return { steps, complete: firstIncompleteStep === null, firstIncompleteStep };
}

/** Every missing field of the sheet, summed over its steps. */
export function sheetMissingTotal(p: Pick<SheetProgress, 'steps'>): number {
  return SHEET_STEPS.reduce((sum, step) => sum + p.steps[step].missing, 0);
}

// --- the texts -------------------------------------------------------------------------

/** The Sheet header's Progress counter: "Completa", "1 obrigatório faltando", "8 obrigatórios faltando" (`60-ficha.html`). */
export function sheetProgressText(p: Pick<SheetProgress, 'steps'>): string {
  const total = sheetMissingTotal(p);
  return total === 0 ? 'Completa' : plural(total, 'obrigatório faltando', 'obrigatórios faltando');
}

/** `.progress-counter[data-state]` of the Sheet header. */
export function sheetProgressState(p: Pick<SheetProgress, 'complete'>): 'complete' | 'pending' {
  return p.complete ? 'complete' : 'pending';
}

/** A stepper step's accessible name: "Placa, 2 faltando" (EXPERIENCE.md › Section stepper). */
export function stepMissingLabel(name: string, n: number): string {
  return `${name}, ${n} faltando`;
}

/** The header's attribution line: "Preenchido por Bruno · 06/09 09:41" (`60-ficha.html`). */
export function filledByText(name: string, at: string): string {
  const when = formatShortDateTime(at);
  return when === '' ? `Preenchido por ${name}` : `Preenchido por ${name} · ${when}`;
}

/** The header's concluded-by line: "Concluída por Bruno · 06/09 10:02". */
export function concludedByText(name: string, at: string): string {
  const when = formatShortDateTime(at);
  return when === '' ? `Concluída por ${name}` : `Concluída por ${name} · ${when}`;
}
