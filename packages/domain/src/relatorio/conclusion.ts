import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { isCompanyBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { isDefectReason } from '../seed/defect-reason.ts';
import { findDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { canonicalJson, fnv1a } from '../text/hash.ts';
import { listPtBr } from '../text/plural.ts';
import { measurementCells, restrictedMeasurements, worstMeasurements, type WorstMeasurement } from './measurement-evaluation.ts';
import { isReadingValue, OVER_RANGE_TEXT_PREFIX } from './over-range.ts';
import { evaluatedCells, failedRatioRows, readingRowLabel, worstReadings, type TestEvaluation, type TestKey, type WorstReading } from './readings.ts';
import { sheetMeasurements, sheetReadings } from './sheet-evaluation.ts';
import { checklistResultUnder } from './sheet-progress.ts';
import { enabledSubBlocksOf, isCellFilled } from './sheet-state.ts';
import { NO_VISIT_CONTEXT, type VisitContext } from './visit-context.ts';

/*
 * Story 5.8 (FR-29, FR-30, AR-11, UX-DR43-47): the sheet's conclusion. The pair the app
 * suggests, the paragraph it composes and the words around them are derived here, from the
 * same reading evaluation the Measurement table shows (`evaluateSheetReadings`), so a
 * reading out of criterion drives the field's helper, the floor and the criteria line
 * identically. ~~The app never sets a verdict: the pair is written only by the engineer's
 * tap, and Reprovado is never suggested.~~ Story 22.4 (2026-11-06, Bruno; amends FR-29 and
 * NFR-10): the sheet's values set a floor (`conclusionFloor`), every reader shows the
 * effective pair (`effectiveConclusionPair`, the stricter of floor and stored), and
 * "Concluir ficha" writes it. The conclusion text is derived on read, never a row; what is
 * stored is only what the engineer confirmed (`text`, `text_status`, `text_basis`).
 */

export type ConclusionResult = 'aprovado' | 'reprovado';
export type ConclusionRestriction = 'sem_restricoes' | 'com_restricoes';
export type ConclusionTextStatus = 'confirmed' | 'edited';


export interface ConclusionPair {
  result: ConclusionResult;
  restriction: ConclusionRestriction;
}

/**
 * Story 14.6: the definition a reader passes, or a seeded block's own. A company block resolves only
 * through a definition context, so its definition always comes from the caller (`blockDefinitionIn`);
 * a reader that forgets it fails loudly here instead of judging the sheet with no definition.
 */
type DefinitionArg = BlockDefinition | null | undefined;

function definitionOf(block: Pick<BlockRow, 'seed_version' | 'block_type'>, definition: DefinitionArg = undefined): BlockDefinition | null {
  if (definition !== undefined) return definition;
  if (isCompanyBlockType(block.block_type)) throw new Error(`conclusion: the company block type "${block.block_type}" needs its definition`);
  return findDefinition(block.seed_version, block.block_type);
}

/** The stored result, or null. */
export function conclusionResultOf(block: Pick<BlockRow, 'sheet'>): ConclusionResult | null {
  const value = block.sheet.conclusion.result?.value;
  return value === 'aprovado' || value === 'reprovado' ? value : null;
}

/** The stored restriction, or null. */
export function conclusionRestrictionOf(block: Pick<BlockRow, 'sheet'>): ConclusionRestriction | null {
  const value = block.sheet.conclusion.restriction?.value;
  return value === 'sem_restricoes' || value === 'com_restricoes' ? value : null;
}

/** The checklist's NC rows of an enabled checklist: 1-based item number, label and observation. */
function ncItems(block: BlockRow, definition: BlockDefinition): { n: number; label: string; observation: string | null }[] {
  if (definition.checklist === null || !enabledSubBlocksOf(block).has('checklist')) return [];
  return definition.checklist.flatMap((item, index) => {
    if (checklistResultUnder(block, item.key, definition) !== 'NC') return [];
    const cell = block.sheet.checklist[item.key]?.observation;
    const observation = isCellFilled(cell) && typeof cell!.value === 'string' ? cell!.value.trim() : null;
    return [{ n: index + 1, label: item.label, observation }];
  });
}

/** E5-Q4: true when the enabled checklist holds at least one Conforme row. */
function anyConforme(block: BlockRow, definition: BlockDefinition): boolean {
  if (definition.checklist === null || !enabledSubBlocksOf(block).has('checklist')) return false;
  return definition.checklist.some((item) => checklistResultUnder(block, item.key, definition) === 'C');
}

/** True when any stored checklist result was answered by the engineer (a `na_defaults` NA alone is not an answer). */
function anyAnswered(block: BlockRow): boolean {
  return Object.values(block.sheet.checklist).some((item) => isCellFilled(item.result));
}

/**
 * Story 22.4: why the floor stands, one reason per source the sheet holds, in this order. Batch e23v
 * (Story 23.6, seed v13): `prerequisite`, a test whose plate fails its prerequisite (Reprovado), and
 * `restriction`, a reading restricted by a rule of its test (Aprovado · Com restrições).
 */
export type ConclusionFloorReason = 'defect' | 'reading' | 'ratio' | 'measurement' | 'prerequisite' | 'restriction' | 'nc' | 'observation';

/** Story 22.4: the least strict pair the sheet allows, and the sources that set it. */
export interface ConclusionFloor {
  pair: ConclusionPair;
  /** Empty for the Aprovado · Sem restrições floor of a clean sheet. */
  reasons: ConclusionFloorReason[];
}

/** A cell holding typed text. */
function holdsText(cell: Cell | null | undefined): boolean {
  return isCellFilled(cell) && typeof cell!.value === 'string' && cell!.value.trim() !== '';
}

/**
 * Story 22.4: the sheet observation, or the observation of an enabled checklist row that is not
 * NC, holds text (an NC row's observation belongs to its NC, already a reason of its own).
 */
function anyObservation(block: BlockRow, definition: BlockDefinition): boolean {
  const enabled = enabledSubBlocksOf(block);
  if (enabled.has('observations') && holdsText(block.sheet.observations)) return true;
  if (definition.checklist === null || !enabled.has('checklist')) return false;
  return definition.checklist.some((item) => checklistResultUnder(block, item.key, definition) !== 'NC' && holdsText(block.sheet.checklist[item.key]?.observation));
}

/**
 * Story 22.4 (Bruno, 2026-11-06, item 26; amends FR-29 and NFR-10): the floor of the sheet's
 * conclusion, the least strict pair what the sheet holds allows. In order:
 * - Reprovado · Com restrições when a reading is out of criterion (insulation, contact, a
 *   ratio row INSATISFATÓRIO through `failedRatioRows`, a measurement-table cell), or when
 *   the sheet is marked Não ensaiado for a reason its seed flags `defect` (`isDefectReason`;
 *   no shipped seed has one yet). Com restrições stays with Reprovado, as the old suggestion
 *   kept it over an out reading (open for Bruno).
 * - Aprovado · Com restrições, short of that, when a checklist row is NC, or the sheet
 *   observation or a checklist row's observation holds text.
 * - Aprovado · Sem restrições, short of both, once something was measured or answered and
 *   nothing stands to check (Epic 14 QA Q-3), unjudged (Story 14.9) or waiting for its vector
 *   group (e21g D6).
 * - Null otherwise, and for a sheet marked Não ensaiado for any other reason.
 * The rule is the kernel's, never the seed's (beyond the `defect` flag): a v5 relatório gets it
 * as a v11 one does.
 *
 * Batch e23v (Story 23.6, seed v13): a test whose plate fails its prerequisite (the arrester's
 * DESLIGADOR ÍNTEGRO NÃO) sets Reprovado · Com restrições, and a restricted reading (within its
 * criterion, flagged by its test's rule) sets Aprovado · Com restrições, short of a failure. Both
 * are read from the evaluation under `visit`, the sheet's `VisitContext` (`visit-context.ts`); a
 * v1 to v12 sheet has neither, so its floor is the same with any context.
 */
export function conclusionFloor(block: BlockRow, given: DefinitionArg = undefined, visit: VisitContext = NO_VISIT_CONTEXT): ConclusionFloor | null {
  const definition = block.not_tested !== null ? null : definitionOf(block, given);
  // e22f S7: once per block row (rows are immutable), definition and (batch e23v) visit context, every reader of the effective pair shares it.
  let byDefinition = FLOORS.get(block);
  if (byDefinition === undefined) {
    byDefinition = new Map();
    FLOORS.set(block, byDefinition);
  }
  let byVisit = byDefinition.get(definition);
  if (byVisit === undefined) {
    byVisit = new WeakMap();
    byDefinition.set(definition, byVisit);
  }
  if (byVisit.has(visit)) return byVisit.get(visit)!;
  const floor = computeFloor(block, definition, visit);
  byVisit.set(visit, floor);
  return floor;
}

const FLOORS = new WeakMap<BlockRow, Map<BlockDefinition | null, WeakMap<VisitContext, ConclusionFloor | null>>>();

function computeFloor(block: BlockRow, definition: BlockDefinition | null, visit: VisitContext): ConclusionFloor | null {
  if (block.not_tested !== null) {
    return isDefectReason(block.seed_version, block.not_tested.reason) ? { pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['defect'] } : null;
  }
  if (definition === null) return null;
  const evaluations = sheetReadings(block, definition, visit);
  const cells = evaluatedCells(evaluations);
  // Story 14.5: the cells of the measurement tests count as the seeded tables' captures do.
  // Batch e23t (Story 23.15): the measurement tests judged under the same visit context.
  const tableCells = measurementCells(sheetMeasurements(block, definition, visit));
  const plainCells = evaluatedCells(evaluations.filter((test) => test.testKey !== 'relacao_transformacao'));
  const failures: ConclusionFloorReason[] = [];
  if (plainCells.some((cell) => cell.verdict === 'out')) failures.push('reading');
  if (failedRatioRows(evaluations).length > 0) failures.push('ratio');
  if (tableCells.some((cell) => cell.verdict === 'out')) failures.push('measurement');
  // Batch e23v (Story 23.6): a failed prerequisite fails the sheet; a restricted reading restricts it.
  if (evaluations.some((test) => test.prerequisite?.failed === true)) failures.push('prerequisite');
  const restrictions: ConclusionFloorReason[] = [];
  // Batch e23t (Stories 23.15, 23.16 and 23.19): a restricted measurement cell or IP restricts too.
  if (cells.some((cell) => cell.verdict === 'restricted') || tableCells.some((cell) => cell.verdict === 'restricted')) restrictions.push('restriction');
  if (ncItems(block, definition).length > 0) restrictions.push('nc');
  if (anyObservation(block, definition)) restrictions.push('observation');
  if (failures.length > 0) return { pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: [...failures, ...restrictions] };
  if (restrictions.length > 0) return { pair: { result: 'aprovado', restriction: 'com_restricoes' }, reasons: restrictions };
  // Epic 14 QA Q-3: a zero or negative reading the criterion cannot judge stands: no floor until it is checked.
  if (tableCells.some((cell) => cell.toCheck)) return null;
  const measured = cells.some((cell) => cell.role === 'capture' && isReadingValue(cell.state)) || tableCells.some((cell) => isReadingValue(cell.state));
  if (!measured && !anyAnswered(block)) return null;
  // Story 14.9: a reading measured under a test no criterion judges (a QGBT with no TENSÃO
  // NOMINAL, or above 1000 V) is never a pass. e21g D6: nor a v11 ratio table waiting for its
  // vector group while its plate can be filled (the `ensaiosCounts` rule).
  const unjudged =
    evaluations.some((test) => test.criterion === null && evaluatedCells([test]).some((cell) => cell.role === 'capture' && isReadingValue(cell.state))) ||
    (enabledSubBlocksOf(block).has('nameplate') && evaluations.some((test) => test.tables.some((table) => table.groupMissing)));
  if (unjudged) return null;
  return { pair: { result: 'aprovado', restriction: 'sem_restricoes' }, reasons: [] };
}

const RESULT_RANK: Readonly<Record<ConclusionResult, number>> = { aprovado: 1, reprovado: 2 };
const RESTRICTION_RANK: Readonly<Record<ConclusionRestriction, number>> = { sem_restricoes: 1, com_restricoes: 2 };

function stricter<T extends string>(rank: Readonly<Record<T, number>>, a: T | null, b: T | null): T | null {
  if (a === null) return b;
  if (b === null) return a;
  return rank[a] >= rank[b] ? a : b;
}

/** Story 22.4: the pair every reader shows and prints; either half null while neither the floor nor the store sets it. */
export interface EffectiveConclusionPair {
  result: ConclusionResult | null;
  restriction: ConclusionRestriction | null;
}

/**
 * Story 22.4 (AD-1, AD-13): the effective pair, per dimension the stricter of the floor and
 * the stored value (result Reprovado over Aprovado, restriction Com over Sem); an unset stored
 * half reads the floor's, so an open sheet with a floor prints its floor marks in a draft.
 * The ficha, section 9, the Sumário, the parecer and the counts read this, never the stored
 * pair alone: a stored pair looser than a later floor is never shown as the conclusion. A sheet
 * marked Não ensaiado ignores its stored pair: only a defect reason's floor gives it one.
 */
export function effectiveConclusionPair(block: BlockRow, definition: DefinitionArg = undefined, visit: VisitContext = NO_VISIT_CONTEXT): EffectiveConclusionPair {
  const floor = conclusionFloor(block, definition, visit)?.pair ?? null;
  // A sheet marked not tested prints no conclusion: a pair stored before the mark is ignored,
  // and only a defect reason's floor applies (review of batch e22c).
  const tested = block.not_tested === null;
  return {
    result: stricter(RESULT_RANK, floor?.result ?? null, tested ? conclusionResultOf(block) : null),
    restriction: stricter(RESTRICTION_RANK, floor?.restriction ?? null, tested ? conclusionRestrictionOf(block) : null),
  };
}

/**
 * e22f (integrated review N2, the floor is a floor, not a conclusion): the pair the engineer
 * has chosen, each half the stored value made stricter by the floor (so a stored half looser
 * than a later floor is still never shown), and null for a half nothing was stored in. The
 * sheet's progress counts the conclusion step from it, and an open sheet prints it: until the
 * sheet is concluded, the floor alone sets no mark and fills no step. A sheet marked Não
 * ensaiado chooses nothing.
 */
export function chosenConclusionPair(block: BlockRow, definition: DefinitionArg = undefined, visit: VisitContext = NO_VISIT_CONTEXT): EffectiveConclusionPair {
  if (block.not_tested !== null) return { result: null, restriction: null };
  const effective = effectiveConclusionPair(block, definition, visit);
  return {
    result: conclusionResultOf(block) === null ? null : effective.result,
    restriction: conclusionRestrictionOf(block) === null ? null : effective.restriction,
  };
}

/**
 * e22f N2: the X marks section 9 prints: the chosen pair, the one the sheet's progress counts,
 * so a draft never prints a mark only the floor sets and the screen and the document agree (the
 * conclude batch writes the floor, Story 22.4, so a concluded sheet prints it; a pair cleared
 * after the conclude prints no mark, as its header counts it missing). A sheet marked Não
 * ensaiado prints its effective pair (a defect reason's floor alone).
 */
export function printedConclusionPair(block: BlockRow, definition: DefinitionArg = undefined, visit: VisitContext = NO_VISIT_CONTEXT): EffectiveConclusionPair {
  return block.not_tested !== null ? effectiveConclusionPair(block, definition, visit) : chosenConclusionPair(block, definition, visit);
}

/**
 * Story 22.4: a complete stored pair the floor has since made stricter (a reading corrected
 * out of criterion after "Concluir ficha"): the ficha shows "Conclusão ajustada pela ficha"
 * with a Confirmar that writes the effective pair.
 */
export function conclusionAdjusted(block: BlockRow, definition: DefinitionArg = undefined, visit: VisitContext = NO_VISIT_CONTEXT): boolean {
  const result = conclusionResultOf(block);
  const restriction = conclusionRestrictionOf(block);
  if (result === null || restriction === null) return false;
  const effective = effectiveConclusionPair(block, definition, visit);
  return effective.result !== result || effective.restriction !== restriction;
}

/** Story 22.4: whether a segment is looser than the floor, so the radiogroups disable it (a stricter one stays choosable). */
export function isLooserThanFloor(block: BlockRow, value: ConclusionResult | ConclusionRestriction, definition: DefinitionArg = undefined, visit: VisitContext = NO_VISIT_CONTEXT): boolean {
  const floor = conclusionFloor(block, definition, visit)?.pair ?? null;
  if (floor === null) return false;
  if (value === 'aprovado' || value === 'reprovado') return RESULT_RANK[value] < RESULT_RANK[floor.result];
  return RESTRICTION_RANK[value] < RESTRICTION_RANK[floor.restriction];
}

const RESULT_WORDS: Readonly<Record<ConclusionResult, string>> = { aprovado: 'Aprovado', reprovado: 'Reprovado' };
const RESTRICTION_WORDS: Readonly<Record<ConclusionRestriction, string>> = { sem_restricoes: 'Sem restrições', com_restricoes: 'Com restrições' };

// authored (Story 22.4, open for Bruno): each source of the floor as the reason line names it.
// authored (Story 23.6, listed for Bruno): `prerequisite` and `restriction`.
const FLOOR_REASON_WORDS: Readonly<Record<ConclusionFloorReason, string>> = {
  defect: 'não ensaiado por defeito',
  reading: 'leitura fora do critério',
  ratio: 'relação de transformação insatisfatória',
  measurement: 'medição fora do critério',
  prerequisite: 'pré-requisito do ensaio não atendido',
  restriction: 'leitura com restrição',
  nc: 'item não conforme',
  observation: 'observação registrada',
};

/**
 * Story 22.4: the one line under the radiogroups naming why segments are disabled: "A ficha
 * exige no mínimo Reprovado · Com restrições: leitura fora do critério." Null while no
 * segment is disabled (no floor, or the Aprovado · Sem restrições floor).
 */
export function conclusionFloorReasonText(block: BlockRow, definition: DefinitionArg = undefined, visit: VisitContext = NO_VISIT_CONTEXT): string | null {
  const floor = conclusionFloor(block, definition, visit);
  if (floor === null || floor.reasons.length === 0) return null;
  // authored (Story 22.4, open for Bruno): the reason line of the disabled segments.
  return `A ficha exige no mínimo ${RESULT_WORDS[floor.pair.result]} · ${RESTRICTION_WORDS[floor.pair.restriction]}: ${listPtBr(floor.reasons.map((reason) => FLOOR_REASON_WORDS[reason]))}.`;
}

/**
 * The suggestion row's pair while the stored pair is unset (Story 5.8 AC 1; Story 22.4: the
 * floor, Reprovado included). Null on a sheet marked not tested, once any segment is set, or
 * while there is no floor.
 */
export function conclusionSuggestion(block: BlockRow, definition: DefinitionArg = undefined, visit: VisitContext = NO_VISIT_CONTEXT): ConclusionPair | null {
  if (block.not_tested !== null) return null;
  if (isCellFilled(block.sheet.conclusion.result) || isCellFilled(block.sheet.conclusion.restriction)) return null;
  return conclusionFloor(block, definition, visit)?.pair ?? null;
}

/** The suggestion row's words: "Aprovado · Sem restrições?". */
export function conclusionSuggestionText(pair: ConclusionPair): string {
  return `${RESULT_WORDS[pair.result]} · ${RESTRICTION_WORDS[pair.restriction]}?`;
}

/**
 * Story 12.4 (J-10, D-7; `source-deltas.md` row 52): the sheet observation the NC items
 * already wrote, suggested while the sheet observation is empty: one line "Item ⟨n⟩:
 * ⟨observação⟩" per NC item that carries an observation, in checklist order, `n` the row
 * number. Null when the sheet observation holds text, the observation or checklist
 * sub-block is off, the sheet is marked not tested, or no NC item has an observation. It is
 * written only by its own "Confirmar" or with the conclusion text's own "Confirmar"; the text
 * confirm "Concluir ficha" folds into its batch (review 2026-10-08 Decision 1,
 * `conclusionTextOnConclude`) never writes it.
 */
export function suggestedSheetObservation(block: BlockRow, definition: BlockDefinition): string | null {
  if (block.not_tested !== null || !enabledSubBlocksOf(block).has('observations')) return null;
  if (isCellFilled(block.sheet.observations)) return null;
  const lines = ncItems(block, definition)
    .filter((item): item is { n: number; label: string; observation: string } => item.observation !== null && item.observation !== '')
    .map((item) => `Item ${item.n}: ${item.observation}`);
  return lines.length === 0 ? null : lines.join('\n');
}

/** Com restrições makes the sheet observation required (Story 5.8 AC 2); Story 22.4: the effective restriction, the floor's included. */
export function observationRequired(block: BlockRow, definition: DefinitionArg = undefined, visit: VisitContext = NO_VISIT_CONTEXT): boolean {
  return effectiveConclusionPair(block, definition, visit).restriction === 'com_restricoes';
}

// --- the composed paragraph -----------------------------------------------------------

// authored: the subject of the paragraph, with its article, one per block type.
const NOUNS: Readonly<Record<EquipmentBlockType, { noun: string; plural: boolean }>> = {
  cabos_entrada: { noun: 'Os cabos de entrada', plural: true },
  para_raio: { noun: 'O para-raio', plural: false },
  chave_seccionadora: { noun: 'A seccionadora', plural: false },
  disjuntor_mt: { noun: 'O disjuntor', plural: false },
  tp: { noun: 'O TP', plural: false },
  tc: { noun: 'O TC', plural: false },
  cabos_saida: { noun: 'Os cabos de saída', plural: true },
  transformador_forca: { noun: 'O transformador', plural: false },
  chave_transferencia_automatica: { noun: 'A chave de transferência automática', plural: false },
  // authored (Story 14.9).
  quadro_eletrico: { noun: 'O quadro elétrico', plural: false },
  // authored (Story 22.11, listed for Bruno).
  inspecao_qgbt: { noun: 'A inspeção do QGBT', plural: false },
};

// authored: the recommendation that follows a restricted or failed result.
const RECOMMENDATION = 'Recomenda-se a correção dos pontos indicados antes da próxima manutenção.';

/**
 * e23f (the production check of 2026-11-07): an NC observation as the clause before "(item N,
 * NC)" reads it, without its final period(s), so "acúmulo de poeira." never prints "poeira. (item
 * 9, NC)". "etc." keeps its period (section 8's `SENTENCE_END` rule); "!" and "?" stay.
 */
function withoutFinalPeriod(observation: string): string {
  const stripped = observation.replace(/[\s.]+$/, '');
  return /\betc$/i.test(stripped) ? `${stripped}.` : stripped;
}

/** What an NC row says before "(item N, NC)": its observation without the final period, else (or when that leaves nothing) its label. */
function ncClauseText(item: { label: string; observation: string | null }): string {
  const said = item.observation === null ? '' : withoutFinalPeriod(item.observation);
  return said === '' ? item.label.toLocaleLowerCase('pt-BR') : said;
}

const TEST_WORDS: Readonly<Record<TestKey, { phrase: string; symbol: string }>> = {
  isolacao: { phrase: 'resistência de isolação mínima de', symbol: 'R_iso' },
  resistencia_contato: { phrase: 'resistência de contato máxima de', symbol: 'R_cont' },
  relacao_transformacao: { phrase: 'desvio de relação de transformação de', symbol: 'RT' },
};

const VOLTAGE_KEYS = ['tensao_de_placa', 'tensao_nominal', 'tensao_nominal_at'];

/** A nameplate value as the paragraph names it: numbers pt-BR with their unit, a voltage class with " kV". */
function identityPart(block: BlockRow, definition: BlockDefinition, keys: readonly string[]): string | null {
  for (const key of keys) {
    const field = definition.nameplate.find((f) => f.key === key);
    const cell = block.sheet.nameplate[key];
    if (field === undefined || !isCellFilled(cell)) continue;
    const value = cell!.value;
    if (typeof value === 'string') {
      const text = value.trim();
      if (field.kind === 'voltage_class' || field.unit === 'kV') return /kv$/i.test(text) ? text : `${text} kV`;
      return text;
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'raw' in value) {
      const v = value as { raw: string; unit?: string | null; state?: string };
      if (v.state !== 'measured') continue;
      const unit = v.unit ?? field.unit ?? null;
      return unit === null ? formatDecimalGroupedPtBr(v.raw) : `${formatDecimalGroupedPtBr(v.raw)} ${unit}`;
    }
  }
  return null;
}

export interface ComposedConclusion {
  /** The paragraph ("A seccionadora SEC-C05 (Celtta, 15 kV, 630 A) apresentou …"). */
  text: string;
  /** The criteria line's items, in the order the text uses them ("R_iso T1–T2 330 MΩ · critério >400 MΩ", "item 8 NC"). */
  criteriaItems: string[];
  /** The criteria line: the items joined " · ". */
  criteriaLine: string;
  /** FNV-1a hex of the canonical JSON of every input used. */
  basis: string;
}

function readingClause(reading: WorstReading): string {
  const phrase = TEST_WORDS[reading.testKey].phrase;
  // authored (e22g, review N2, listed for Bruno): a limit the instrument passed reads "acima de 2.000 µΩ (limite do instrumento)", never "de > 2.000 µΩ".
  const value =
    reading.overRange === true && reading.valueText.startsWith(OVER_RANGE_TEXT_PREFIX)
      ? `${phrase.replace(/ de$/, '')} acima de ${reading.valueText.slice(OVER_RANGE_TEXT_PREFIX.length)} (limite do instrumento)`
      : `${phrase} ${reading.valueText}`;
  return `${value} em ${reading.where} (critério: ${reading.criterionText}, ${reading.sourceName})`;
}

/**
 * Batch e23v (Story 23.6, seed v13): a test whose plate fails its prerequisite, as the paragraph names
 * it. authored (Story 23.6, listed for Bruno): "pré-requisito não atendido (Desligador íntegro: NÃO)
 * no ensaio de isolação".
 */
function prerequisiteClause(test: TestEvaluation): string | null {
  const failure = test.prerequisite ?? null;
  return failure === null ? null : `${failure.text} no ${test.title.toLocaleLowerCase('pt-BR')}`;
}

/**
 * Batch e23v (Story 23.6, seed v13): a test's restricted readings, each row named with its reason, as
 * the paragraph and the derived point name them ("Fase C: abaixo de 50 % da maior leitura").
 */
export function restrictedItems(test: TestEvaluation): string[] {
  return test.tables.flatMap((table) =>
    table.rows.flatMap((row) => row.cells.flatMap((cell) => (cell.verdict === 'restricted' && cell.restriction != null ? [`${readingRowLabel(table.rows, row)}: ${cell.restriction.reason}`] : []))),
  );
}

/** authored (Story 23.6, listed for Bruno): a test's restricted readings in the paragraph, "com restrição no ensaio de isolação (Fase C: …)". */
function restrictedClause(test: TestEvaluation): string | null {
  const items = restrictedItems(test);
  return items.length === 0 ? null : `com restrição no ${test.title.toLocaleLowerCase('pt-BR')} (${items.join('; ')})`;
}

/**
 * Batch e23t (Story 23.16, seed v13): an IP out of its class as the paragraph names it. authored
 * (Story 23.16, listed for Bruno): "IP de 0,8 no ensaio de isolação em Primário–Massa (critério: IP ≥ 1,0, NETA MTS-2023 7.2.1/7.2.2)".
 */
function indexClause(test: TestEvaluation, reading: NonNullable<TestEvaluation['indexOut']>[number]): string {
  return `${reading.valueText} no ${test.title.toLocaleLowerCase('pt-BR')} em ${reading.where} (critério: ${reading.criterionText}, ${reading.sourceName})`;
}

// authored (Story 14.5): how an out reading of a measurement test is named, whatever its
// criterion: "resistência de contato fora do critério em Polo C, Lado Emergência (63 µΩ;
// critério: ≤ 50 % acima do menor do mesmo lado, NETA 7.22.3 (fonte secundária))".
function measurementClause(reading: WorstMeasurement, keepCase = false): string {
  // Batch e23t: a FO.SERV-03 type's test (`keepCase`) lowers only its first letter, so an acronym keeps its case
  // ("resistência dos fusíveis HH"); the CTA's and a company type's read as before.
  const label = keepCase ? `${reading.label.charAt(0).toLocaleLowerCase('pt-BR')}${reading.label.slice(1)}` : reading.label.toLocaleLowerCase('pt-BR');
  return `${label} fora do critério em ${reading.where} (${reading.valueText}; critério: ${reading.criterionText}, ${reading.sourceName})`;
}

// The basis hash lives in `text/hash.ts` (shared with the parecer, Story 7.4).

/**
 * FR-30: the conclusion paragraph composed on the device from the sheet's own values, one
 * fixed template per block type: the identity from the nameplate, each test's worst
 * reading when it is out of criterion (else "valores medidos dentro dos critérios de
 * aceitação", only when a capture was judged), the NC items with their observations (else
 * "todos os itens verificados conformes", only with a C row), a clause saying what was not
 * recorded (E5-Q4) and, when restricted or failed, the recommendation. No network, no model.
 */
/** The subject of the paragraph: a seeded type's from `NOUNS`, a company type's from its noun and gender ("O no-break"). */
function nounOf(definition: BlockDefinition): { noun: string; plural: boolean } {
  if (definition.noun !== undefined) return { noun: `${definition.noun.gender === 'f' ? 'A' : 'O'} ${definition.noun.singular}`, plural: false };
  // A company type always carries its noun (`asBlockDefinition`); a seeded one is keyed by its type.
  return NOUNS[definition.block_type as EquipmentBlockType];
}

export function composeConclusion(block: BlockRow, definition: BlockDefinition, equipmentTag: string, visit: VisitContext = NO_VISIT_CONTEXT): ComposedConclusion {
  const noun = nounOf(definition);
  // The maker: FABRICAÇÃO on the eight, Fabricante on the Chave de transferência automática.
  const fabricacao = identityPart(block, definition, ['fabricacao', 'fabricante']);
  const tensao = identityPart(block, definition, VOLTAGE_KEYS);
  const corrente = identityPart(block, definition, ['corrente_nominal']);
  const identity = [fabricacao, tensao, corrente].filter((part): part is string => part !== null && part !== '');
  const tag = equipmentTag.trim();
  const subject = [noun.noun, tag === '' ? null : tag, identity.length === 0 ? null : `(${identity.join(', ')})`].filter((part) => part !== null).join(' ');

  const evaluations = sheetReadings(block, definition, visit);
  const cells = evaluatedCells(evaluations);
  const worst = worstReadings(evaluations);
  const out = worst.filter((reading) => reading.verdict === 'out');
  // Story 14.5: the measurement tests (none on the eight FO.SERV-03 types), read as the seeded tables are.
  const measurements = sheetMeasurements(block, definition, visit);
  const tableCells = measurementCells(measurements);
  const tableOut = worstMeasurements(measurements);
  // Batch e23t (Story 23.16): an IP out of its class is a failure the paragraph names with the out readings.
  const indexOut = evaluations.flatMap((test) => (test.indexOut ?? []).map((reading) => indexClause(test, reading)));
  // Batch e23v (Story 23.6, seed v13): a failed prerequisite is a failure the paragraph names with the out readings.
  const prerequisites = evaluations.flatMap((test) => {
    const clause = prerequisiteClause(test);
    return clause === null ? [] : [clause];
  });
  const outClauses = [...out.map(readingClause), ...indexOut, ...tableOut.map((reading) => measurementClause(reading, measurements.find((test) => test.testKey === reading.testKey)?.unnumbered === true)), ...prerequisites];
  // Batch e23v (Story 23.6, seed v13): the restricted readings, named after the readings' clause.
  const restricted = [
    ...evaluations.flatMap((test) => {
      const clause = restrictedClause(test);
      return clause === null ? [] : [clause];
    }),
    // Batch e23t (Stories 23.15 and 23.19): a measurement test's restricted cells, named the same way.
    ...restrictedMeasurements(measurements).map((test) => `com restrição na ${test.label.charAt(0).toLocaleLowerCase('pt-BR')}${test.label.slice(1)} (${test.items.join('; ')})`),
  ];
  // E5-Q4: "within the criteria" only when a capture was judged; "conformes" only with a C row.
  const judged = outClauses.length > 0 || cells.some((cell) => cell.role === 'capture' && cell.verdict !== null) || tableCells.some((cell) => cell.verdict !== null);
  // A capture measured but never judged (a TTR row with no VAL CALCULADO) is still a measurement.
  const measured = cells.some((cell) => cell.role === 'capture' && isReadingValue(cell.state)) || tableCells.some((cell) => isReadingValue(cell.state));
  // authored (OQ-3 placeholder): measured, no criterion applied.
  const unjudged = 'valores medidos sem comparação com o critério de aceitação';
  // Epic 14 QA Q-3: a zero or negative reading to check is never "within the criteria".
  // authored: Epic 14 QA Q-3 (open for Bruno).
  const toCheck = 'valores medidos com leitura a conferir';
  const plainReadings =
    outClauses.length > 0 ? listPtBr(outClauses) : tableCells.some((cell) => cell.toCheck) ? toCheck : judged ? 'valores medidos dentro dos critérios de aceitação' : unjudged;
  const readings = restricted.length === 0 ? plainReadings : `${plainReadings}, ${listPtBr(restricted)}`;
  const hasReadings = judged || measured;
  const ncs = ncItems(block, definition);
  const conformes = anyConforme(block, definition);
  const checked = ncs.length > 0 || conformes;
  const checklist =
    ncs.length === 0
      ? 'todos os itens verificados conformes'
      : listPtBr(ncs.map((item) => `${ncClauseText(item)} (item ${item.n}, NC)`));

  // Story 22.4: the effective pair, so a text the floor made stricter recommends the correction.
  const { result, restriction } = effectiveConclusionPair(block, definition, visit);
  const recommend = restriction === 'com_restricoes' || result === 'reprovado';
  const verb = noun.plural ? 'apresentaram' : 'apresentou';
  // authored (OQ-3 placeholder): the sentence states only what exists.
  const body =
    hasReadings && checked
      ? `${verb} ${readings} e ${checklist}`
      : hasReadings
        ? `${verb} ${readings}, sem itens verificados registrados`
        : checked
          ? // e22g (review N5): a type with nothing to measure (the Inspeção de QGBT) never says no value was recorded.
            definition.tests.length === 0 && (definition.measurement_tests ?? []).length === 0
            ? `${verb} ${checklist}`
            : `${verb} ${checklist}, sem valores medidos registrados`
          : `não ${verb} valores medidos nem itens verificados registrados`;
  const text = `${subject} ${body}.${recommend ? ` ${RECOMMENDATION}` : ''}`;

  const criteriaItems = [
    ...worst.map((reading) => `${TEST_WORDS[reading.testKey].symbol} ${reading.where} ${reading.valueText} · critério ${reading.criterionText}`),
    ...tableOut.map((reading) => {
      const test = measurements.find((candidate) => candidate.testKey === reading.testKey)!;
      // Batch e23t (Story 23.15): a FO.SERV-03 type's measurement test has no number; it is named by its label.
      return `${test.unnumbered === true ? test.label : `E${test.number}`} ${reading.where} ${reading.valueText} · critério ${reading.criterionText}`;
    }),
    ...ncs.map((item) => `item ${item.n} NC`),
  ];

  const basis = fnv1a(
    canonicalJson({
      pair: { result, restriction },
      identity: { tag, fabricacao, tensao, corrente },
      judged,
      measured,
      conformes,
      // Batch e23v (Stories 23.5 and 23.6): a cell's corrected value (`c`) and restriction reason (`x`) join its
      // entry only where present, so every v1 to v12 basis (and every `text_basis` stored) keeps its bytes.
      readings: cells.map((cell) => ({
        a: cell.address,
        s: cell.state,
        r: cell.raw,
        u: cell.unit,
        f: cell.fallback?.raw ?? null,
        v: cell.verdict,
        ...(cell.corrected == null ? {} : { c: cell.corrected.raw }),
        ...(cell.restriction == null ? {} : { x: cell.restriction.reason }),
      })),
      nc: ncs,
      ...(prerequisites.length === 0 ? {} : { prerequisites }),
      // Story 14.5: only a type with measurement tests adds its key, so the basis of every
      // sheet of the eight (and every `text_basis` already stored) is the bytes it always was.
      ...(measurements.length === 0
        ? {}
        : {
            tables: measurements.map((test) => ({
              k: test.testKey,
              e: test.enabled,
              x: test.skipped,
              // Batch e23t (Stories 23.15 and 23.19): a cell's corrected value (`c`) and restriction reason (`x`) join only where present (v5 to v12 bytes kept).
              c: test.rows.flatMap((row) =>
                row.cells
                  .filter((cell) => cell.fixed === null)
                  .map((cell) => ({
                    a: cell.address,
                    s: cell.state,
                    r: cell.raw,
                    u: cell.unit,
                    v: cell.verdict,
                    ...(cell.corrected == null ? {} : { c: cell.corrected.raw }),
                    ...(cell.restriction == null ? {} : { x: cell.restriction.reason }),
                  })),
              ),
            })),
          }),
    }),
  );

  return { text, criteriaItems, criteriaLine: criteriaItems.join(' · '), basis };
}

export type ConclusionTextState = 'unconfirmed' | 'confirmed' | 'edited' | 'stale';

function storedText(block: Pick<BlockRow, 'sheet'>, key: 'text' | 'text_status' | 'text_basis'): string | null {
  const value = block.sheet.conclusion[key]?.value;
  return typeof value === 'string' ? value : null;
}

/** The stored text status, or null while unconfirmed. */
export function conclusionTextStatusOf(block: Pick<BlockRow, 'sheet'>): ConclusionTextStatus | null {
  const status = storedText(block, 'text_status');
  return status === 'confirmed' || status === 'edited' ? status : null;
}

/**
 * Where the Generated text field stands (AR-11): `unconfirmed` (the composed text shows and
 * recomposes), `confirmed` or `edited` (the stored text shows), `stale` (stored, but the
 * values changed since: "Sugerido: texto atualizado — Substituir", never an overwrite).
 * p020 P-3: a stored text equal to the text composed now is never `stale`, whatever its
 * basis says: the basis hashes inputs the paragraph does not show (every cell of every
 * table, a within-criterion reading, a skipped test's cells), so a basis moved by such an
 * input offered "Substituir" with the very same text. Stale means the text would change.
 * The production case was not reproduced in the kernel (the conclude batch, the fold and a
 * JSON round trip give an equal basis). Two unconfirmed hypotheses from the p020 review: a
 * reading committed on blur after the conclude batch composed its basis
 * (`apps/web/src/surfaces/ficha/use-ficha-actions.ts:149`), and the merge folding a
 * concurrent `text_basis` put as sequential (`merge/policy.ts:119`).
 */
export function conclusionTextState(block: Pick<BlockRow, 'sheet'>, composed: Pick<ComposedConclusion, 'basis' | 'text'>): ConclusionTextState {
  const status = conclusionTextStatusOf(block);
  if (status === null) return 'unconfirmed';
  if (storedText(block, 'text_basis') === composed.basis) return status;
  return storedText(block, 'text') === composed.text ? status : 'stale';
}

/**
 * E5-A4: true when the pair is complete, the way the sheet's progress counts it
 * (`sheet-progress.ts`): a result and a restriction are both set. Story 22.4: the effective
 * pair, so a floor completes an unset half.
 */
export function conclusionPairComplete(block: BlockRow, definition: DefinitionArg = undefined, visit: VisitContext = NO_VISIT_CONTEXT): boolean {
  const pair = effectiveConclusionPair(block, definition, visit);
  return pair.result !== null && pair.restriction !== null;
}

/**
 * The stored text the renderer prints, or null ("not printable") while the text is
 * unconfirmed or the pair it concludes is incomplete (E5-A4: a result or a restriction
 * cleared after the confirm leaves the confirmed text unprintable until the pair is set again).
 */
export function conclusionTextForPrint(block: BlockRow, definition: DefinitionArg = undefined, visit: VisitContext = NO_VISIT_CONTEXT): string | null {
  if (conclusionTextStatusOf(block) === null || !conclusionPairComplete(block, definition, visit)) return null;
  const text = storedText(block, 'text');
  return text === null || text.trim() === '' ? null : text;
}

/**
 * E5-A4: true when the text composed from `block` now still has `basis`, the basis of the
 * text the engineer saw. A confirm checks it against the freshest block before it writes, so
 * a value changed between the render and the tap never stores a text under a basis it was
 * not composed from.
 */
export function conclusionBasisMatches(block: BlockRow, definition: BlockDefinition, equipmentTag: string, basis: string, visit: VisitContext = NO_VISIT_CONTEXT): boolean {
  return composeConclusion(block, definition, equipmentTag, visit).basis === basis;
}

/**
 * e22f S1: what "Confirmar" under "Conclusão ajustada pela ficha" writes, from the fresh block:
 * each half of the effective pair that differs from the stored one, and, when the stored text
 * is the confirmed suggestion (`text_status` `confirmed`, never `edited`) and no longer the one
 * composed now (`stale`), the composed text with its basis, so the adjusted sheet does not keep
 * a text that names the looser pair. Writing the pair leaves the effective pair, and so the
 * composition, unchanged, so the text composed before the write is the one that stands after
 * it. An edited text is the engineer's own and is never written: it then reads `stale`
 * ("Substituir"). Null when nothing differs.
 */
export function conclusionAdjustWrites(
  block: BlockRow,
  definition: BlockDefinition,
  equipmentTag: string,
  visit: VisitContext = NO_VISIT_CONTEXT,
): { result: ConclusionResult | null; restriction: ConclusionRestriction | null; text: { text: string; basis: string } | null } | null {
  const pair = effectiveConclusionPair(block, definition, visit);
  const result = pair.result !== null && pair.result !== conclusionResultOf(block) ? pair.result : null;
  const restriction = pair.restriction !== null && pair.restriction !== conclusionRestrictionOf(block) ? pair.restriction : null;
  const composed = composeConclusion(block, definition, equipmentTag, visit);
  const text = conclusionTextStatusOf(block) === 'confirmed' && conclusionTextState(block, composed) === 'stale' ? { text: composed.text, basis: composed.basis } : null;
  return result === null && restriction === null && text === null ? null : { result, restriction, text };
}

/**
 * The paragraph section 9 prints under the X marks (AR-11): an edited text always, a confirmed
 * one while it is still the text composed now, never an unconfirmed text, nor one of an
 * incomplete printed pair (`printedConclusionPair`). e22f S1: a confirmed text the floor made stale (the sheet adjusted, its
 * stored pair looser than the effective one, "Conclusão ajustada pela ficha") prints the text
 * composed now: the engineer confirmed the suggestion, and the stricter pair the document prints
 * is never left without its paragraph. Null when nothing prints.
 */
export function printedConclusionText(block: BlockRow, definition: BlockDefinition, equipmentTag: string, visit: VisitContext = NO_VISIT_CONTEXT): string | null {
  // e22f N2: the pair section 9 marks, so an open sheet whose pair only the floor sets prints no paragraph either.
  const printed = printedConclusionPair(block, definition, visit);
  if (printed.result === null || printed.restriction === null) return null;
  const status = conclusionTextStatusOf(block);
  if (status === null) return null;
  if (status === 'edited') return conclusionTextForPrint(block, definition, visit);
  const composed = composeConclusion(block, definition, equipmentTag, visit);
  const state = conclusionTextState(block, composed);
  if (state === 'confirmed') return conclusionTextForPrint(block, definition, visit);
  return state === 'stale' && conclusionAdjusted(block, definition, visit) ? composed.text : null;
}

/** The stored conclusion text, or null. */
export function conclusionStoredText(block: Pick<BlockRow, 'sheet'>): string | null {
  return storedText(block, 'text');
}

/**
 * `source-deltas.md`, row of 2026-10-08 ("Story 5.8: the composed conclusion text …";
 * review 2026-10-08 JRN-V1, Decision 1): what "Concluir ficha" and "Concluir e avançar"
 * confirm with the conclusion, the way D-4 folds the suggested instruments into the same
 * tap. Called on the fresh block inside the conclude's edit, so the text and its basis come
 * from one composition of the values as they stand at the tap, including a reading whose
 * commit landed after the render (Story 12.1); a text is never stored under a basis it was
 * not composed from (E5-A4). Null, and nothing about the text is written, unless the sheet
 * is tested, its conclusion sub-block is on, the result and restriction pair is set and no
 * text was confirmed or edited yet (`text_status` null): a confirmed or edited text, stale
 * or not, is never written by the conclude (a stale one shows as stale through
 * `conclusionTextState`). Story 5.8's own "Confirmar" stays, and the D-7 sheet observation
 * suggestion is not part of this fold.
 */
export function conclusionTextOnConclude(block: BlockRow, definition: BlockDefinition, equipmentTag: string, visit: VisitContext = NO_VISIT_CONTEXT): { text: string; basis: string } | null {
  if (block.not_tested !== null) return null;
  if (!enabledSubBlocksOf(block).has('conclusion')) return null;
  if (!conclusionPairComplete(block, definition, visit) || conclusionTextStatusOf(block) !== null) return null;
  const composed = composeConclusion(block, definition, equipmentTag, visit);
  return { text: composed.text, basis: composed.basis };
}
