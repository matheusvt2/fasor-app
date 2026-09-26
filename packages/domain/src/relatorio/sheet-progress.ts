import type { SubBlockKey } from '../schemas/block-config.ts';
import type { BlockRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { plural } from '../text/plural.ts';
import { formatShortDateTime } from '../format/datetime.ts';
import { cabineOf, cabineProgress } from './cabine.ts';
import { nameplateTagPrefill } from './nameplate-copy.ts';
import { evaluatedCells, evaluateSheetReadings } from './readings.ts';
import { enabledSubBlocksOf, isCellFilled } from './sheet-state.ts';
import { firstInTree } from './tree.ts';

/*
 * Story 5.1: the per-sheet progress the Sheet header's Progress counter, the Section
 * stepper and "Concluir ficha" read (EXPERIENCE.md › Progress counter, Section stepper).
 * Named `sheetProgress`, not `progress`: Story 4.3's relatório-wide `progress(snapshot)`
 * already owns that name (spec 5.1-5.4, Naming resolution).
 *
 * What counts as missing, step by step:
 * - `placa`: every nameplate field of the block's definition whose cell is not filled (a
 *   TAG field with no cell, shown prefilled from the block's TAG, is filled: Story 12.3);
 *   plus, on the cabine's first sheet, every cabine field still empty (`cabineProgress`,
 *   J-03: the cabine block renders inside this step). Both need the snapshot's locations,
 *   equipment and relatório; a caller passing blocks alone counts the plate cells only.
 * - `verificacoes`: every checklist item neither answered (a filled result cell) nor NA by
 *   the block's `na_defaults` with no cell of its own; plus every NC row whose observation
 *   is empty (the observation is required on NC).
 * - `ensaios`: per address of the enabled tests (`evaluateSheetReadings`, the fixture's
 *   row/col addressing), every capture cell not filled (a "Não medido" is filled) plus every
 *   ratio input with no effective value (typed, or read from the nameplate); `print` and
 *   `derived` columns never count.
 * - `conclusao`: 1 while the result is unset, 1 while the restriction is unset, and 1 while
 *   the restriction is Com restrições and the sheet observation is empty (Story 5.8 AC 2).
 *   The conclusion text never counts: an unconfirmed text does not block "Concluir ficha".
 * A disabled sub-block counts nothing (AR-17). A pending suggestion is a row, never a
 * cell, so an unconfirmed suggestion is empty here by construction.
 */

export type SheetStep = 'placa' | 'verificacoes' | 'ensaios' | 'conclusao';

/** The four steps in their stepper order. */
export const SHEET_STEPS: readonly SheetStep[] = ['placa', 'verificacoes', 'ensaios', 'conclusao'];

/** The sub-blocks each step fills (`placaMissing`, `verificacoesMissing`, `ensaiosCounts`, `conclusaoMissing`); Ensaios is every test. */
const STEP_SUB_BLOCKS: Readonly<Record<SheetStep, readonly SubBlockKey[]>> = {
  placa: ['nameplate'],
  verificacoes: ['checklist'],
  ensaios: ['isolacao', 'ia_ip_display', 'resistencia_contato', 'relacao_transformacao'],
  conclusao: ['conclusion'],
};

/**
 * E12-A7 (batch D low a): the steps a sheet shows, in stepper order: those whose sub-block
 * the block's config enables (`enabledSubBlocksOf`). The stepper draws only these and the
 * Sheet header's sentence (`sheetSummaryText`) names only these, so no sentence calls an off
 * step "pronta". Placa stays on the cabine's first sheet (`cabineFirst`) whatever its plate,
 * since the cabine's fields are filled there.
 */
export function shownSheetSteps(block: Pick<BlockRow, 'config'>, options: { cabineFirst?: boolean } = {}): SheetStep[] {
  const enabled = enabledSubBlocksOf(block);
  return SHEET_STEPS.filter((step) => STEP_SUB_BLOCKS[step].some((key) => enabled.has(key)) || (step === 'placa' && options.cabineFirst === true));
}

/** One step's counts: what is missing, and (Ensaios only) the readings out of their criterion. */
export interface SheetStepProgress {
  missing: number;
  /** Story 12.1 (D-2): capture cells whose verdict is `out`; 0 on every step but `ensaios`. */
  outOfLimit: number;
  /**
   * E12-Q10: on `placa` only, the share of `missing` that are cabine fields (the cabine's
   * first sheet counts them in this step); absent everywhere else.
   */
  cabine?: number;
}

export interface SheetProgress {
  steps: Record<SheetStep, SheetStepProgress>;
  /** Every step's `missing` is zero. */
  complete: boolean;
  /** The first step (stepper order) with something missing, or null when complete. */
  firstIncompleteStep: SheetStep | null;
}

/** The value of a checklist result cell that names a non-conformity. */
const NC = 'NC';

/** The restriction value that makes the sheet observation required (`relatorio/conclusion.ts`). */
const COM_RESTRICOES = 'com_restricoes';

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

/** What `sheetProgress` reads: the blocks, and the rest of the snapshot when the caller has it. */
export type SheetProgressSnapshot = Pick<RelatorioSnapshot, 'blocks'> & Partial<Pick<RelatorioSnapshot, 'relatorio' | 'locations' | 'equipment'>>;

/** The cabine block is expanded and counted on its cabine's first sheet (`firstInTree`). */
export function isCabineFirstSheet(snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'>, blockId: string): boolean {
  const block = snapshot.blocks.find((row) => row.id === blockId);
  const cabine = cabineOf(snapshot.locations, block?.location_id ?? null);
  return cabine !== null && firstInTree(snapshot, cabine.id) === blockId;
}

/** The Placa step's missing fields: the plate's own and, on the cabine's first sheet, the cabine's. */
function placaMissing(snapshot: SheetProgressSnapshot, block: BlockRow, definition: BlockDefinition, enabled: ReadonlySet<SubBlockKey>): { plate: number; cabine: number } {
  let plate = 0;
  if (enabled.has('nameplate')) {
    const prefilled = snapshot.equipment === undefined ? null : nameplateTagPrefill({ blocks: snapshot.blocks, equipment: snapshot.equipment }, block.id);
    plate = definition.nameplate.filter((field) => !isCellFilled(block.sheet.nameplate[field.key]) && !(field.key === 'tag' && prefilled !== null)).length;
  }
  let cabineMissing = 0;
  const { relatorio, locations, equipment } = snapshot;
  if (relatorio !== undefined && locations !== undefined && equipment !== undefined && isCabineFirstSheet({ blocks: snapshot.blocks, locations, equipment }, block.id)) {
    const cabine = cabineOf(locations, block.location_id);
    if (cabine !== null) cabineMissing = cabineProgress({ relatorio, locations }, cabine.id).missing.length;
  }
  return { plate, cabine: cabineMissing };
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

function ensaiosCounts(block: BlockRow, definition: BlockDefinition): SheetStepProgress {
  const cells = evaluatedCells(evaluateSheetReadings(block, definition));
  return { missing: cells.filter((cell) => cell.missing).length, outOfLimit: cells.filter((cell) => cell.verdict === 'out').length };
}

function conclusaoMissing(block: BlockRow, enabled: ReadonlySet<SubBlockKey>): number {
  if (!enabled.has('conclusion')) return 0;
  const { result, restriction } = block.sheet.conclusion;
  let missing = 0;
  if (!isCellFilled(result)) missing += 1;
  if (!isCellFilled(restriction)) missing += 1;
  else if (restriction!.value === COM_RESTRICOES && enabled.has('observations') && !isCellFilled(block.sheet.observations)) missing += 1;
  return missing;
}

/** One sheet's progress; every step empty-handed (0) for a block that is not an equipment sheet. */
export function sheetProgress(snapshot: SheetProgressSnapshot, blockId: string): SheetProgress {
  const block = snapshot.blocks.find((row) => row.id === blockId);
  const definition = block === undefined ? null : definitionOf(block);
  const steps: Record<SheetStep, SheetStepProgress> = {
    placa: { missing: 0, outOfLimit: 0 },
    verificacoes: { missing: 0, outOfLimit: 0 },
    ensaios: { missing: 0, outOfLimit: 0 },
    conclusao: { missing: 0, outOfLimit: 0 },
  };
  // Story 5.9 / AR-17: a sheet marked not tested prints from its plate and its reason
  // alone (section 8); its nameplate/checklist/tests/conclusion go read-only and never
  // block "Concluir ficha" or the stepper on their own account.
  if (block !== undefined && block.not_tested !== null) {
    return { steps, complete: true, firstIncompleteStep: null };
  }
  if (block !== undefined && definition !== null) {
    const enabled = enabledSubBlocksOf(block);
    const placa = placaMissing(snapshot, block, definition, enabled);
    steps.placa = { missing: placa.plate + placa.cabine, outOfLimit: 0, ...(placa.cabine > 0 ? { cabine: placa.cabine } : {}) };
    steps.verificacoes.missing = verificacoesMissing(block, definition, enabled);
    steps.ensaios = ensaiosCounts(block, definition);
    steps.conclusao.missing = conclusaoMissing(block, enabled);
  }
  const firstIncompleteStep = SHEET_STEPS.find((step) => steps[step].missing > 0) ?? null;
  return { steps, complete: firstIncompleteStep === null, firstIncompleteStep };
}

/**
 * Story 12.1 (D-2, `source-deltas.md` 2026-09-24): whether a step the engineer has left may
 * be drawn collapsed: nothing missing in it and no reading out of its criterion (an amber
 * reading stays in view). When it is left is the surface's call; this is the kernel's rule.
 */
export function stepMayCollapse(p: Pick<SheetProgress, 'steps'>, step: SheetStep): boolean {
  const counts = p.steps[step];
  return counts.missing === 0 && counts.outOfLimit === 0;
}

/** The per-step missing counts a text reads. */
type StepMissing = { steps: Record<SheetStep, { missing: number }> };

/** Every missing field of the sheet, summed over its steps. */
export function sheetMissingTotal(p: StepMissing): number {
  return SHEET_STEPS.reduce((sum, step) => sum + p.steps[step].missing, 0);
}

// --- the texts -------------------------------------------------------------------------

/** The Sheet header's Progress counter: "Completa", "1 obrigatório faltando", "8 obrigatórios faltando" (`60-ficha.html`). */
export function sheetProgressText(p: StepMissing): string {
  const total = sheetMissingTotal(p);
  return total === 0 ? 'Completa' : plural(total, 'obrigatório faltando', 'obrigatórios faltando');
}

/** How each step reads in the Sheet header sentence once done, and whether its noun is singular. */
const SUMMARY_DONE: Record<SheetStep, { noun: string; singular: boolean }> = {
  placa: { noun: 'placa', singular: true },
  verificacoes: { noun: 'verificações', singular: false },
  ensaios: { noun: 'leituras', singular: false },
  conclusao: { noun: 'conclusão', singular: true },
};

/** One piece of the Sheet header sentence: plain text, or a missing count the header emphasises (`.n-missing`). */
export interface SheetSummaryPart {
  text: string;
  kind: 'text' | 'missing';
}

/** The per-step counts the Sheet header sentence reads (the Placa step with its cabine share). */
type SummaryCounts = { steps: Record<SheetStep, { missing: number; cabine?: number }> };

/** A count and its noun, the count its own part: "9" + " leituras". */
function countParts(n: number, one: string, many: string): SheetSummaryPart[] {
  return [
    { text: String(n), kind: 'missing' },
    { text: ` ${n === 1 ? one : many}`, kind: 'text' },
  ];
}

/**
 * How each step reads in the Sheet header sentence while something in it is missing. The
 * Placa step names its plate fields and its cabine fields apart (E12-Q10), the plate first:
 * "2 campos da placa, 6 campos da cabine".
 */
function summaryMissingParts(step: SheetStep, counts: { missing: number; cabine?: number }): SheetSummaryPart[][] {
  switch (step) {
    case 'placa': {
      const cabine = Math.min(counts.cabine ?? 0, counts.missing);
      const plate = counts.missing - cabine;
      const parts: SheetSummaryPart[][] = [];
      if (plate > 0) parts.push(countParts(plate, 'campo da placa', 'campos da placa'));
      if (cabine > 0) parts.push(countParts(cabine, 'campo da cabine', 'campos da cabine'));
      return parts;
    }
    case 'verificacoes':
      return [countParts(counts.missing, 'verificação', 'verificações')];
    case 'ensaios':
      return [countParts(counts.missing, 'leitura', 'leituras')];
    case 'conclusao':
      return [[{ text: 'a conclusão', kind: 'text' }]];
  }
}

/** "a", "a e b", "a, b e c". */
function joinPtBr(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** `joinPtBr` over lists of parts, the separators as text parts. */
function joinPartsPtBr(items: readonly SheetSummaryPart[][]): SheetSummaryPart[] {
  return items.flatMap((item, index) => {
    if (index === 0) return item;
    const separator = index === items.length - 1 ? ' e ' : ', ';
    return [{ text: separator, kind: 'text' as const }, ...item];
  });
}

function capitalise(text: string): string {
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

/**
 * Story 12.5 (DESIGN.md § v0.9 › Sheet header, J-14): the Sheet header's one sentence of
 * progress, "Placa e verificações prontas · faltam 9 leituras e a conclusão", in parts:
 * each missing count is a `missing` part the header draws in `.n-missing` (E12-Q8,
 * `key-equipment-sheet-v09.html`), the rest plain text. The steps done are named first, in
 * stepper order ("pronta" after one singular noun, else "prontas"), then what is missing,
 * the verb agreeing with its first part ("falta 1 leitura", "falta a conclusão", "faltam 9
 * leituras"). A step the stepper does not show (`shown`) is never named. "Ficha completa"
 * once nothing is missing (authored copy, an open question for Bruno and Matheus).
 */
export function sheetSummaryParts(p: SummaryCounts, shown: readonly SheetStep[] = SHEET_STEPS): SheetSummaryPart[] {
  const steps = SHEET_STEPS.filter((step) => shown.includes(step));
  const done = steps.filter((step) => p.steps[step].missing === 0);
  const missing = steps.filter((step) => p.steps[step].missing > 0);
  if (missing.length === 0) return [{ text: 'Ficha completa', kind: 'text' }];
  const items = missing.flatMap((step) => summaryMissingParts(step, p.steps[step]));
  // The verb agrees with the first thing missing: a count of 1 or "a conclusão" is singular.
  const lead = items[0]![0]!;
  const verb = lead.kind === 'text' || lead.text === '1' ? 'falta' : 'faltam';
  const missingParts = joinPartsPtBr(items);
  if (done.length === 0) return [{ text: `${capitalise(verb)} `, kind: 'text' }, ...missingParts];
  const adjective = done.length === 1 && SUMMARY_DONE[done[0]!].singular ? 'pronta' : 'prontas';
  return [{ text: `${capitalise(joinPtBr(done.map((step) => SUMMARY_DONE[step].noun)))} ${adjective} · ${verb} `, kind: 'text' }, ...missingParts];
}

/** `sheetSummaryParts` as one string. */
export function sheetSummaryText(p: SummaryCounts, shown: readonly SheetStep[] = SHEET_STEPS): string {
  return sheetSummaryParts(p, shown)
    .map((part) => part.text)
    .join('');
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
