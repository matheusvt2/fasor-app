import type { BlockRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, seedRule, snapshotDefinitionContext, type DefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition, OilRule } from '../seed/schema.ts';
import { listPtBr, plural } from '../text/plural.ts';
import { formatShortDateTime } from '../format/datetime.ts';
import { cabineOf, cabineProgress } from './cabine.ts';
import { chosenConclusionPair, effectiveConclusionPair, observationRequiredFor, restrictionApplies } from './conclusion.ts';
import { nameplateMissingKeys } from './dry-insulation.ts';
import { measurementCounts } from './measurement-evaluation.ts';
import { nameplateTitleOf } from './nameplate-block.ts';
import { oilDerivedNaKeysUnder, oilRuleOf } from './oil-rule.ts';
import { evaluatedCells, evaluatedChoices } from './readings.ts';
import { sheetMeasurements, sheetReadings } from './sheet-evaluation.ts';
import { enabledSubBlocksOf, isCellFilled } from './sheet-state.ts';
import { tapRowRequired } from './tap-rows.ts';
import { firstInTree } from './tree.ts';
import { VECTOR_GROUP_FIELD } from './vector-group.ts';
// Batch e23v (Stories 23.5 and 23.6): the sheet is judged under its visit context.
import { NO_VISIT_CONTEXT, visitContextOf, type VisitContext } from './visit-context.ts';

/*
 * Story 5.1: the per-sheet progress the Sheet header's Progress counter, the Section
 * stepper and "Concluir ficha" read (EXPERIENCE.md › Progress counter, Section stepper).
 * Named `sheetProgress`, not `progress`: Story 4.3's relatório-wide `progress(snapshot)`
 * already owns that name (spec 5.1-5.4, Naming resolution).
 *
 * What counts as missing, step by step:
 * - `placa`: `nameplateMissingKeys` (`dry-insulation.ts`, the one rule the field's missing
 *   marker also reads): every nameplate field of the block's definition whose cell is not
 *   filled (a TAG field with no cell, shown prefilled from the block's TAG, is filled: Story
 *   12.3; VOL. ÓLEO on a block whose subtype or stored TIPO DE ISOLAÇÃO is dry is not
 *   missing: review 2026-10-08, Decision 2);
 *   plus, on the cabine's first sheet, every cabine field still empty (`cabineProgress`,
 *   J-03: the cabine block renders inside this step). Both need the snapshot's locations,
 *   equipment and relatório; a caller passing blocks alone counts the plate cells only.
 * - `verificacoes`: every checklist item neither answered (a filled result cell) nor NA by
 *   the block's `na_defaults` with no cell of its own; plus every NC row whose observation
 *   is empty (the observation is required on NC).
 * - `ensaios`: per address of the enabled tests (`evaluateSheetReadings`, the fixture's
 *   row/col addressing), every capture cell not filled (a "Não medido" is filled) plus every
 *   ratio input with no effective value (typed, or read from the nameplate); `print` and
 *   `derived` columns never count. Story 14.5: plus, per measurement test switched on and run
 *   (`evaluateSheetMeasurements`), every typed cell of a shown row that is neither optional
 *   nor fixed and holds nothing, and every shown, non-optional test value that holds nothing;
 *   a test switched off, or one its own value says was not run, requires nothing.
 * - `conclusao`: 1 while the result is unset, 1 while the restriction is unset, and 1 while
 *   the restriction is Com restrições and the sheet observation is empty (Story 5.8 AC 2).
 *   ~~Story 22.4: of the effective pair (`effectiveConclusionPair`), so a floor counts as set.~~
 *   e22f N2: of the chosen pair (`chosenConclusionPair`): a floor alone fills no step; the
 *   `floorFills` option reads the effective pair for the conclude gate.
 *   The conclusion text never counts: an unconfirmed text does not block "Concluir ficha".
 * A disabled sub-block counts nothing (AR-17). A pending suggestion is a row, never a
 * cell, so an unconfirmed suggestion is empty here by construction.
 */

export type SheetStep = 'placa' | 'verificacoes' | 'ensaios' | 'conclusao';

/** The four steps in their stepper order. */
export const SHEET_STEPS: readonly SheetStep[] = ['placa', 'verificacoes', 'ensaios', 'conclusao'];

/**
 * The sub-blocks each step fills (`placaMissing`, `verificacoesMissing`, `ensaiosCounts`, `conclusaoMissing`); Ensaios is every test:
 * every sub-block but the four parts below (Story 14.6: a company type's test keys are its own, so they are not listed by name).
 */
const STEP_PARTS: Readonly<Record<Exclude<SheetStep, 'ensaios'>, string>> = { placa: 'nameplate', verificacoes: 'checklist', conclusao: 'conclusion' };
const NOT_A_TEST: ReadonlySet<string> = new Set(['nameplate', 'checklist', 'observations', 'conclusion']);

function stepShown(step: SheetStep, enabled: ReadonlySet<string>): boolean {
  if (step === 'ensaios') return [...enabled].some((key) => !NOT_A_TEST.has(key));
  return enabled.has(STEP_PARTS[step]);
}

/**
 * E12-A7 (batch D low a): the steps a sheet shows, in stepper order: those whose sub-block
 * the block's config enables (`enabledSubBlocksOf`). The stepper draws only these and the
 * Sheet header's sentence (`sheetSummaryText`) names only these, so no sentence calls an off
 * step "pronta". Placa stays on the cabine's first sheet (`cabineFirst`) whatever its plate,
 * since the cabine's fields are filled there.
 */
export function shownSheetSteps(
  block: Pick<BlockRow, 'config'> & Partial<Pick<BlockRow, 'seed_version'>>,
  options: { cabineFirst?: boolean; definition?: Pick<BlockDefinition, 'checklist'> | null } = {},
): SheetStep[] {
  const enabled = enabledSubBlocksOf(block);
  // Fix batch e24y (F10, seed v14 `empty_steps_hidden`): a checklist step whose definition holds no item (the
  // Malha de aterramento) shows nothing on the sheet, so it is neither drawn nor named "pronta".
  const empty = options.definition != null && typeof block.seed_version === 'string' && seedRule(block.seed_version, 'empty_steps_hidden') && (options.definition.checklist ?? []).length === 0;
  return SHEET_STEPS.filter((step) => (step === 'verificacoes' && empty ? false : stepShown(step, enabled) || (step === 'placa' && options.cabineFirst === true)));
}

/**
 * Fix batch e24y (F10): the name a step reads by where the definition gives its block a title of its
 * own (the v14 Malha's "Dados da malha", `nameplate_title`): the stepper's step and the Sheet header
 * read it; null where the surface's own step name stands (every other step, every older definition).
 */
export function sheetStepTitle(step: SheetStep, definition: Pick<BlockDefinition, 'nameplate_title'> | null | undefined): string | null {
  return step === 'placa' ? nameplateTitleOf(definition) : null;
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
  /**
   * p020 P-4: on `conclusao` only, the share of `missing` that is the sheet observation
   * Com restrições requires (0 or 1); absent everywhere else and when it is not missing.
   */
  observation?: number;
  /**
   * e21g D7: on `ensaios` only, the share of `missing` that is ratio rows waiting for the
   * transformer's vector group (LIGAÇÃO SECUNDÁRIA); absent everywhere else and when 0.
   */
  group?: number;
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

/** The item keys the block's config pre-marks NA (display default, never a cell). */
export function naDefaultsOf(block: Pick<BlockRow, 'config'>): ReadonlySet<string> {
  const config = block.config;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return new Set();
  const keys = (config as { na_defaults?: unknown }).na_defaults;
  return new Set(Array.isArray(keys) ? keys.filter((key): key is string => typeof key === 'string') : []);
}

/** What `checklistResultOf` reads of a block: the seed version and type only for the oil rule (seed v6). */
type ResultBlock = Pick<BlockRow, 'config' | 'sheet'> & Partial<Pick<BlockRow, 'seed_version' | 'block_type'>>;

/**
 * The result a checklist row shows: its stored value when one is filled, "NA" for an
 * `na_defaults` item with no cell of its own, else null (unset).
 *
 * Story 14.11 (seed v6): on a block whose definition has an oil rule (`oil-rule.ts`) the rule
 * alone decides its oil items, never the config's `na_defaults`: on a non-oil unit an oil item
 * shows "NA" whenever its own result is not filled (a cell cleared to null included); on an oil
 * or unknown unit it shows its stored value or nothing.
 */
export function checklistResultOf(block: ResultBlock, itemKey: string, ctx: DefinitionContext): 'C' | 'NC' | 'NA' | null {
  return resultUnder(block, itemKey, oilRuleOf(block, ctx));
}

/**
 * `checklistResultOf` for a reader that holds the block's own definition (the conclusion, the
 * parecer): its oil rule is the definition's, a company type's included (e22h).
 */
export function checklistResultUnder(block: ResultBlock, itemKey: string, definition: Pick<BlockDefinition, 'oil_rule'> | null): 'C' | 'NC' | 'NA' | null {
  return resultUnder(block, itemKey, definition?.oil_rule ?? null);
}

function resultUnder(block: ResultBlock, itemKey: string, rule: OilRule | null): 'C' | 'NC' | 'NA' | null {
  const cell = block.sheet.checklist[itemKey]?.result;
  if (isCellFilled(cell)) {
    const value = cell!.value;
    return value === 'C' || value === 'NC' || value === 'NA' ? value : null;
  }
  // Batch e24s (Story 24.11): a dry item (seed v14's `dry_items`) the same way, NA on an oil unit.
  if (rule?.items.includes(itemKey as OilRule['items'][number]) === true || rule?.dry_items?.includes(itemKey) === true) return oilDerivedNaKeysUnder(rule, block).has(itemKey) ? 'NA' : null;
  if (cell !== undefined) return null;
  return naDefaultsOf(block).has(itemKey) ? 'NA' : null;
}

/**
 * Whether the result a checklist row shows is its own stored cell: false for a display default
 * (an `na_defaults` NA with no cell, an oil item's derived NA), so the first tap on that row
 * still commits a real cell.
 */
export function checklistResultIsStored(block: ResultBlock, itemKey: string, ctx: DefinitionContext): boolean {
  const cell = block.sheet.checklist[itemKey]?.result;
  if (cell === undefined) return false;
  return isCellFilled(cell) || checklistResultOf(block, itemKey, ctx) === null;
}

/** What `sheetProgress` reads: the blocks, and the rest of the snapshot when the caller has it. */
export type SheetProgressSnapshot = Pick<RelatorioSnapshot, 'blocks'> & Partial<Pick<RelatorioSnapshot, 'relatorio' | 'locations' | 'equipment' | 'equipment_types'>>;

/** The cabine block is expanded and counted on its cabine's first sheet (`firstInTree`). */
export function isCabineFirstSheet(snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'>, blockId: string): boolean {
  const block = snapshot.blocks.find((row) => row.id === blockId);
  const cabine = cabineOf(snapshot.locations, block?.location_id ?? null);
  return cabine !== null && firstInTree(snapshot, cabine.id) === blockId;
}

/** The Placa step's missing fields: the plate's own and, on the cabine's first sheet, the cabine's. */
function placaMissing(snapshot: SheetProgressSnapshot, block: BlockRow, enabled: ReadonlySet<string>): { plate: number; cabine: number } {
  const plate = enabled.has('nameplate') ? nameplateMissingKeys({ blocks: snapshot.blocks, equipment: snapshot.equipment, equipment_types: snapshot.equipment_types }, block.id).size : 0;
  let cabineMissing = 0;
  const { relatorio, locations, equipment } = snapshot;
  if (relatorio !== undefined && locations !== undefined && equipment !== undefined && isCabineFirstSheet({ blocks: snapshot.blocks, locations, equipment }, block.id)) {
    const cabine = cabineOf(locations, block.location_id);
    if (cabine !== null) cabineMissing = cabineProgress({ relatorio, locations }, cabine.id).missing.length;
  }
  return { plate, cabine: cabineMissing };
}

function verificacoesMissing(block: BlockRow, definition: BlockDefinition, enabled: ReadonlySet<string>, ctx: DefinitionContext): number {
  if (!enabled.has('checklist') || definition.checklist === null) return 0;
  let missing = 0;
  for (const item of definition.checklist) {
    const result = checklistResultOf(block, item.key, ctx);
    if (result === null) missing += 1;
    else if (result === NC && !isCellFilled(block.sheet.checklist[item.key]?.observation)) missing += 1;
  }
  return missing;
}

function ensaiosCounts(block: BlockRow, definition: BlockDefinition, enabled: ReadonlySet<string>, visit: VisitContext): SheetStepProgress {
  const evaluations = sheetReadings(block, definition, visit);
  const cells = evaluatedCells(evaluations);
  const measurements = measurementCounts(sheetMeasurements(block, definition, visit));
  // Story 21.1: a v11 ratio row with no vector group to compute VAL CALCULADO counts one missing,
  // only while the plate that holds LIGAÇÃO SECUNDÁRIA can be filled (its sub-block enabled).
  // Fix batch e23g (R2-3): only a required row counts (`tapRowRequired`: every v11/v12 row; on a v13
  // tap table the current tap and the extremes, never an unmarked or off-plate row).
  const groupMissing = !enabled.has('nameplate')
    ? 0
    : evaluations.reduce((sum, test) => sum + test.tables.reduce((rows, table) => rows + (table.groupMissing ? table.rows.filter((row) => tapRowRequired(row)).length : 0), 0), 0);
  // Seed v13, batch e23e (Story 23.18): a row's choice cell (POLARIDADE) counts missing while empty and out when it fails.
  const choices = evaluatedChoices(evaluations);
  return {
    missing: cells.filter((cell) => cell.missing).length + groupMissing + measurements.missing + choices.filter((choice) => choice.missing).length,
    outOfLimit: cells.filter((cell) => cell.verdict === 'out').length + measurements.outOfLimit + choices.filter((choice) => choice.verdict === 'out').length,
    ...(groupMissing > 0 ? { group: groupMissing } : {}),
  };
}

function conclusaoMissing(block: BlockRow, definition: BlockDefinition, enabled: ReadonlySet<string>, floorFills: boolean, visit: VisitContext): { missing: number; observation: number } {
  if (!enabled.has('conclusion')) return { missing: 0, observation: 0 };
  // ~~Story 22.4: the effective pair, so a floor fills an unset half~~ e22f N2: the chosen pair
  // (a stored half, made stricter by the floor); with `floorFills`, what "Concluir ficha" will
  // write, the effective pair (the floor fills an unset half in the conclude batch).
  const { result, restriction } = floorFills ? effectiveConclusionPair(block, definition, visit) : chosenConclusionPair(block, definition, visit);
  let missing = 0;
  let observation = 0;
  if (result === null) missing += 1;
  // Batch e24a (Story 24.3, seed v14): a Reprovado takes no restriction (`restrictionApplies`); with no result
  // chosen yet, the one the screen shows (the effective one) decides, as it decides whether the group is drawn.
  const shown = result ?? effectiveConclusionPair(block, definition, visit).result;
  if (restriction === null && restrictionApplies(block, shown)) missing += 1;
  // Com restrições requires the observation; batch e24a (Story 24.3, seed v14): a Reprovado too (`observationRequiredFor`).
  if (observationRequiredFor(block, { result, restriction }) !== null && enabled.has('observations') && !isCellFilled(block.sheet.observations)) observation = 1;
  return { missing: missing + observation, observation };
}

/** One sheet's progress; every step empty-handed (0) for a block that is not an equipment sheet. */
/**
 * e22f N2: `floorFills` counts the conclusion step as "Concluir ficha" will leave it, the floor
 * filling an unset half (`effectiveConclusionPair`): the conclude gate, its jump and the
 * primary's "Concluir e avançar" read it. Without it (the header line, the stepper, the
 * Sumário) the step is ready only from a pair the engineer stored.
 */
export function sheetProgress(snapshot: SheetProgressSnapshot, blockId: string, options: { floorFills?: boolean } = {}): SheetProgress {
  const block = snapshot.blocks.find((row) => row.id === blockId);
  // Story 14.6: a company sheet's definition comes from the snapshot's type versions.
  const ctx = snapshotDefinitionContext(snapshot);
  const definition = block === undefined ? null : blockDefinitionIn(ctx, block);
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
    const placa = placaMissing(snapshot, block, enabled);
    steps.placa = { missing: placa.plate + placa.cabine, outOfLimit: 0, ...(placa.cabine > 0 ? { cabine: placa.cabine } : {}) };
    steps.verificacoes.missing = verificacoesMissing(block, definition, enabled, ctx);
    // Batch e23v: the visit context of the sheet when the caller holds its locations and equipment, else none.
    const visit = snapshot.locations === undefined || snapshot.equipment === undefined ? NO_VISIT_CONTEXT : visitContextOf({ locations: snapshot.locations, equipment: snapshot.equipment, relatorio: snapshot.relatorio }, block);
    steps.ensaios = ensaiosCounts(block, definition, enabled, visit);
    const conclusao = conclusaoMissing(block, definition, enabled, options.floorFills === true, visit);
    steps.conclusao = { missing: conclusao.missing, outOfLimit: 0, ...(conclusao.observation > 0 ? { observation: conclusao.observation } : {}) };
  }
  const firstIncompleteStep = SHEET_STEPS.find((step) => steps[step].missing > 0) ?? null;
  return { steps, complete: firstIncompleteStep === null, firstIncompleteStep };
}

/** e21g D7: where "Concluir ficha" lands on an incomplete sheet: a step, and the field to focus when the kernel knows it. */
export interface SheetJumpTarget {
  step: SheetStep;
  /** The `data-field-key` to focus inside the step; null lands on the step's first missing field. */
  fieldKey: string | null;
}

/**
 * e21g D7: the jump target of an incomplete sheet. When the first incomplete step is Ensaios and
 * all it misses is the vector group (LIGAÇÃO SECUNDÁRIA holds a value naming no group, so Placa
 * counts it filled), the target is that Placa field; otherwise the first incomplete step. Null
 * when complete. The counts never change; only the landing does.
 */
export function sheetJumpTarget(progress: Pick<SheetProgress, 'firstIncompleteStep' | 'steps'>): SheetJumpTarget | null {
  const step = progress.firstIncompleteStep;
  if (step === null) return null;
  const ensaios = progress.steps.ensaios;
  if (step === 'ensaios' && ensaios.group !== undefined && ensaios.missing === ensaios.group) return { step: 'placa', fieldKey: VECTOR_GROUP_FIELD };
  return { step, fieldKey: null };
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

/** How each step reads in the Sheet header sentence once done, and whether its noun is singular (and masculine). */
interface DoneNoun {
  noun: string;
  singular: boolean;
  masculine?: boolean;
}
const SUMMARY_DONE: Record<SheetStep, DoneNoun> = {
  placa: { noun: 'placa', singular: true },
  verificacoes: { noun: 'verificações', singular: false },
  ensaios: { noun: 'leituras', singular: false },
  conclusao: { noun: 'conclusão', singular: true },
};

/**
 * Fix batch e24y (F10): a plate block's own title as the Sheet header's noun: lower case, its number
 * and gender read from its first word's ending ("Dados da malha": "dados", masculine plural).
 */
function titleNoun(title: string): DoneNoun {
  const noun = title.charAt(0).toLocaleLowerCase('pt-BR') + title.slice(1);
  const head = (noun.split(/\s/u)[0] ?? '').toLocaleLowerCase('pt-BR');
  if (head.endsWith('os')) return { noun, singular: false, masculine: true };
  if (head.endsWith('as') || head.endsWith('es') || head.endsWith('ões')) return { noun, singular: false };
  if (head.endsWith('o')) return { noun, singular: true, masculine: true };
  return { noun, singular: true };
}

/** The done noun of a step, the plate block's own title where it has one. */
function doneNoun(step: SheetStep, plateTitle: string | null): DoneNoun {
  return step === 'placa' && plateTitle !== null ? titleNoun(plateTitle) : SUMMARY_DONE[step];
}

/** "pronta", "prontas", "pronto", "prontos": one singular noun agrees with it; several, or a plural, take the plural, masculine with any masculine noun. */
function doneAdjective(nouns: readonly DoneNoun[]): string {
  const singular = nouns.length === 1 && nouns[0]!.singular;
  const masculine = nouns.some((noun) => noun.masculine === true);
  return `pront${masculine ? 'o' : 'a'}${singular ? '' : 's'}`;
}

/** One piece of the Sheet header sentence: plain text, or a missing count the header emphasises (`.n-missing`). */
export interface SheetSummaryPart {
  text: string;
  kind: 'text' | 'missing';
  /**
   * p020 P-4: on a `text` part that names what is missing, true when the noun is plural ("as
   * observações"), so the verb agrees ("faltam"); absent reads singular ("a conclusão"). A
   * `missing` count agrees by its own number.
   */
  plural?: boolean;
}

/** The per-step counts the Sheet header sentence reads (the Placa step with its cabine share). */
type SummaryCounts = { steps: Record<SheetStep, { missing: number; cabine?: number; observation?: number }> };

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
 * "2 campos da placa, 6 campos do local".
 */
function summaryMissingParts(step: SheetStep, counts: { missing: number; cabine?: number; observation?: number }, plateTitle: string | null = null): SheetSummaryPart[][] {
  switch (step) {
    case 'placa': {
      const cabine = Math.min(counts.cabine ?? 0, counts.missing);
      const plate = counts.missing - cabine;
      const parts: SheetSummaryPart[][] = [];
      // authored (e24y, listed for Bruno): a plate block with a title of its own, "2 campos de dados da malha".
      const where = plateTitle === null ? 'da placa' : `de ${titleNoun(plateTitle).noun}`;
      if (plate > 0) parts.push(countParts(plate, `campo ${where}`, `campos ${where}`));
      // authored (Story 14.2): on screen the root location is the "local".
      if (cabine > 0) parts.push(countParts(cabine, 'campo do local', 'campos do local'));
      return parts;
    }
    case 'verificacoes':
      return [countParts(counts.missing, 'verificação', 'verificações')];
    case 'ensaios':
      return [countParts(counts.missing, 'leitura', 'leituras')];
    case 'conclusao': {
      // p020 P-4: the pair, the observation Com restrições requires, or both.
      const observation = Math.min(counts.observation ?? 0, counts.missing);
      const pair = counts.missing - observation;
      // authored: p020 P-4, "as observações" (the sheet's Observações field).
      if (pair === 0) return [[{ text: 'as observações', kind: 'text', plural: true }]];
      if (observation > 0) return [[{ text: 'a conclusão', kind: 'text' }], [{ text: 'as observações', kind: 'text', plural: true }]];
      return [[{ text: 'a conclusão', kind: 'text' }]];
    }
  }
}

/** `listPtBr` over lists of parts, the separators as text parts. */
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
export function sheetSummaryParts(p: SummaryCounts, shown: readonly SheetStep[] = SHEET_STEPS, plateTitle: string | null = null): SheetSummaryPart[] {
  const steps = SHEET_STEPS.filter((step) => shown.includes(step));
  const done = steps.filter((step) => p.steps[step].missing === 0);
  const missing = steps.filter((step) => p.steps[step].missing > 0);
  if (missing.length === 0) return [{ text: 'Ficha completa', kind: 'text' }];
  const items = missing.flatMap((step) => summaryMissingParts(step, p.steps[step], plateTitle));
  // The verb agrees with the first thing missing: a count of 1, or a noun part not flagged
  // plural ("a conclusão"), is singular; p020 P-4: "as observações" carries `plural`.
  const lead = items[0]![0]!;
  const singular = lead.kind === 'missing' ? lead.text === '1' : lead.plural !== true;
  const verb = singular ? 'falta' : 'faltam';
  const missingParts = joinPartsPtBr(items);
  if (done.length === 0) return [{ text: `${capitalise(verb)} `, kind: 'text' }, ...missingParts];
  // Fix batch e24y (F10): the plate block's own title is a noun of its own gender ("Dados da malha prontos").
  const nouns = done.map((step) => doneNoun(step, plateTitle));
  // authored (e24y, listed for Bruno): "pronto" and "prontos" after a masculine title.
  const adjective = doneAdjective(nouns);
  return [{ text: `${capitalise(listPtBr(nouns.map((noun) => noun.noun)))} ${adjective} · ${verb} `, kind: 'text' }, ...missingParts];
}

/** `sheetSummaryParts` as one string. */
export function sheetSummaryText(p: SummaryCounts, shown: readonly SheetStep[] = SHEET_STEPS, plateTitle: string | null = null): string {
  return sheetSummaryParts(p, shown, plateTitle)
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
